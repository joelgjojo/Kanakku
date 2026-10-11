import crypto from "crypto";
import { handleMessage } from "@/lib/bot";
import type { Media } from "@/lib/ai/gemini";

export const maxDuration = 60;

// Twilio WhatsApp webhook. Point the sandbox "When a message comes in" URL here:
//   https://<your-app>/api/whatsapp
export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);

  if (process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VALIDATE !== "false") {
    const url = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/whatsapp` : req.url;
    if (!validTwilio(url, params, req.headers.get("x-twilio-signature"))) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const text = params.get("Body") ?? "";
  let media: Media | undefined;
  if (Number(params.get("NumMedia") ?? 0) > 0) {
    const url = params.get("MediaUrl0")!;
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, redirect: "follow" });
    if (res.ok) {
      media = {
        mimeType: params.get("MediaContentType0") ?? res.headers.get("content-type") ?? "application/octet-stream",
        data: Buffer.from(await res.arrayBuffer()).toString("base64"),
      };
    }
  }

  const { reply } = await handleMessage({ text, media, source: "whatsapp" });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
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
