import crypto from "crypto";
import { after } from "next/server";
import { handleMessage, type BotReply } from "@/lib/bot";
import type { Media } from "@/lib/ai/gemini";

export const maxDuration = 60;

// Twilio waits 15 s for an answer. If we're not done in 10 s (big notebook photo),
// we say "working on it" right away and send the real answer as a second message.
const REPLY_BUDGET_MS = 10_000;

// Twilio WhatsApp webhook. Point the sandbox "When a message comes in" URL here:
//   https://<your-app>/api/whatsapp
export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);

  if (process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VALIDATE !== "false") {
    const url = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/whatsapp` : req.url;
    if (!validTwilio(url, params, req.headers.get("x-twilio-signature"))) {
      console.error(`[kanakku] WhatsApp signature check failed for ${url}. Set PUBLIC_URL to the exact address Twilio calls.`);
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const from = params.get("From") ?? ""; // the shopkeeper, e.g. whatsapp:+9194...
  const to = params.get("To") ?? ""; // our Twilio WhatsApp number
  const text = params.get("Body") ?? "";
  const hasMedia = Number(params.get("NumMedia") ?? 0) > 0;
  console.log(`[kanakku] WhatsApp in: from ${from} to ${to}, ${hasMedia ? `media ${params.get("MediaContentType0")}` : `"${text.slice(0, 60)}"`}`);

  // Replies go out through Twilio's Messages API, not in the webhook response.
  // Newer Twilio trial WhatsApp numbers ignore replies in the response, and the API
  // tells us exactly why a send fails (it shows up in Vercel's logs).
  // Set WHATSAPP_REPLY_MODE=twiml to use the old in-response reply instead.
  const useApi = process.env.WHATSAPP_REPLY_MODE !== "twiml" && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;

  const work: Promise<BotReply> = (async () => {
    let media: Media | undefined;
    if (hasMedia) media = await downloadMedia(params.get("MediaUrl0")!, params.get("MediaContentType0"));
    if (hasMedia && !media) return { kind: "error", reply: "⚠️ Couldn't open that file. Please send it again." } as BotReply;
    return handleMessage({ text, media, source: "whatsapp" });
  })().catch((e) => ({ kind: "error", reply: `⚠️ ${(e as Error).message}` }) as BotReply);

  const quick = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), REPLY_BUDGET_MS))]);
  if (quick) {
    if (!useApi) return twiml(quick.reply);
    await sendWhatsApp(from, to, quick.reply);
    return twiml(null);
  }

  // Still working (big photo): say so now, finish in the background, then send the result.
  const wait = hasMedia ? "⏳ Reading it now. I'll send the result in a few seconds." : "⏳ One moment…";
  after(async () => {
    const res = await work;
    await sendWhatsApp(from, to, res.reply);
  });
  if (!useApi) return twiml(wait);
  await sendWhatsApp(from, to, wait);
  return twiml(null);
}

function twiml(message: string | null) {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const twilioAuth = () =>
  "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");

async function downloadMedia(url: string, type: string | null): Promise<Media | undefined> {
  const res = await fetch(url, { headers: { Authorization: twilioAuth() }, redirect: "follow" });
  if (!res.ok) {
    console.error(`[kanakku] WhatsApp media download failed: ${res.status}`);
    return undefined;
  }
  return {
    mimeType: type ?? res.headers.get("content-type") ?? "application/octet-stream",
    data: Buffer.from(await res.arrayBuffer()).toString("base64"),
  };
}

async function sendWhatsApp(to: string, from: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid || !process.env.TWILIO_AUTH_TOKEN) return console.error("[kanakku] Can't send follow-up: Twilio keys missing");
  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1550) }),
    });
  } catch (e) {
    return console.error(`[kanakku] Couldn't reach Twilio to send the reply: ${(e as Error).message}`);
  }
  const out = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
  if (!res.ok) console.error(`[kanakku] Twilio send FAILED (${res.status}) code ${out.code}: ${out.message} — from ${from} to ${to}`);
  else console.log(`[kanakku] WhatsApp reply queued: ${out.sid} status=${out.status}`);
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// https://www.twilio.com/docs/usage/security#validating-requests
function validTwilio(url: string, params: URLSearchParams, signature: string | null) {
  if (!signature) return false;
  const data = [...params.keys()].sort().reduce((s, k) => s + k + params.get(k), url);
  const expected = crypto.createHmac("sha1", process.env.TWILIO_AUTH_TOKEN!).update(Buffer.from(data, "utf-8")).digest("base64");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
