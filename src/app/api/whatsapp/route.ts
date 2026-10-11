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

type TwilioResult = { ok: boolean; status: number; sid?: string; state?: string; code?: number; message?: string };

async function postMessage(fields: Record<string, string>): Promise<TwilioResult> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    const out = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    return { ok: res.ok, status: res.status, sid: out.sid, state: out.status, code: out.code, message: out.message };
  } catch (e) {
    return { ok: false, status: 0, message: `Couldn't reach Twilio: ${(e as Error).message}` };
  }
}

// Twilio's newer trial WhatsApp numbers refuse plain text (error 21654 "ContentSid Required")
// and only send Content Templates. We keep one template whose whole body is a variable,
// create it automatically the first time, and put the reply in that variable.
// Inside the 24-hour window after the shopkeeper messages us, it doesn't need WhatsApp approval.
const TEMPLATE_NAME = "kanakku_reply";
let templateSid: string | null = process.env.TWILIO_CONTENT_SID || null;
let useTemplate = !!templateSid;

async function contentApi(path: string, init?: RequestInit) {
  const res = await fetch(`https://content.twilio.com/v1/${path}`, {
    ...init,
    headers: { Authorization: twilioAuth(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function ensureTemplate(): Promise<string | null> {
  if (templateSid) return templateSid;
  try {
    const list = await contentApi("Content?PageSize=100");
    const found = (list.data.contents as { sid: string; friendly_name: string }[] | undefined)?.find((c) => c.friendly_name === TEMPLATE_NAME);
    if (found) return (templateSid = found.sid);
    for (const body of ["{{1}}", "🧾 {{1}}"]) {
      const made = await contentApi("Content", {
        method: "POST",
        body: JSON.stringify({ friendly_name: TEMPLATE_NAME, language: "en", variables: { "1": "Kanakku reply" }, types: { "twilio/text": { body } } }),
      });
      if (made.ok && made.data.sid) {
        templateSid = String(made.data.sid);
        console.log(`[kanakku] Created WhatsApp template ${templateSid}. Optional: set TWILIO_CONTENT_SID=${templateSid} in Vercel.`);
        return templateSid;
      }
      console.error(`[kanakku] Template create failed (${made.status}): ${JSON.stringify(made.data).slice(0, 300)}`);
    }
  } catch (e) {
    console.error(`[kanakku] Twilio Content API unreachable: ${(e as Error).message}`);
  }
  return null;
}

async function sendWhatsApp(to: string, from: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return console.error("[kanakku] Can't send reply: Twilio keys missing");
  const text = body.slice(0, 1500);

  let r: TwilioResult | null = null;
  if (!useTemplate) {
    r = await postMessage({ To: to, From: from, Body: text });
    if (r.code === 21654) useTemplate = true; // this sender only takes templates
  }
  if (useTemplate) {
    const sid = await ensureTemplate();
    if (!sid) return console.error("[kanakku] Twilio send FAILED: this WhatsApp number needs a template and one couldn't be created.");
    r = await postMessage({ To: to, From: from, ContentSid: sid, ContentVariables: JSON.stringify({ "1": text }) });
    // WhatsApp may refuse line breaks inside template variables. Flatten and retry once.
    if (!r.ok && /new ?line|tab|variable|parameter|63005|63028|21656/i.test(`${r.code} ${r.message}`)) {
      r = await postMessage({ To: to, From: from, ContentSid: sid, ContentVariables: JSON.stringify({ "1": text.replace(/\s*\n+\s*/g, " · ") }) });
    }
  }
  if (r?.ok) console.log(`[kanakku] WhatsApp reply queued: ${r.sid} status=${r.state}${useTemplate ? " (template)" : ""}`);
  else console.error(`[kanakku] Twilio send FAILED (${r?.status}) code ${r?.code}: ${r?.message} — from ${from} to ${to}`);
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
