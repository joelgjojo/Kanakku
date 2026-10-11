import crypto from "crypto";
import { after } from "next/server";
import { handleMessage, type BotReply } from "@/lib/bot";
import type { Media } from "@/lib/ai/gemini";

export const maxDuration = 60;

// WhatsApp through Meta's free Cloud API (no Twilio, no card needed).
// In the Meta app dashboard → WhatsApp → Configuration, set:
//   Callback URL:  https://<your-app>/api/whatsapp/meta
//   Verify token:  the same value as WHATSAPP_VERIFY_TOKEN
// and subscribe to the "messages" field.

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
const seen = new Set<string>(); // Meta sometimes delivers the same message twice

// Meta calls this once to check the webhook belongs to us.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[kanakku] Meta webhook verified");
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  console.error("[kanakku] Meta webhook verification failed: verify token doesn't match WHATSAPP_VERIFY_TOKEN");
  return new Response("Verification failed", { status: 403 });
}

interface MetaMessage {
  id: string;
  from: string; // sender's number, e.g. 918943262406
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  voice?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string };
}

export async function POST(req: Request) {
  const raw = await req.text();

  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.error("[kanakku] Meta signature check failed. Check META_APP_SECRET (App settings → Basic → App secret).");
      return new Response("Invalid signature", { status: 403 });
    }
  }

  let payload: { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: MetaMessage[] } }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const jobs: { msg: MetaMessage; phoneId: string }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneId = change.value?.metadata?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
      for (const msg of change.value?.messages ?? []) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        if (seen.size > 500) seen.delete(seen.values().next().value!);
        jobs.push({ msg, phoneId });
      }
    }
  }

  // Answer Meta straight away (it retries if we're slow), then do the work.
  if (jobs.length) after(() => Promise.all(jobs.map((j) => handle(j.msg, j.phoneId))).then(() => undefined));
  return new Response("ok", { status: 200 });
}

async function handle(msg: MetaMessage, phoneId: string) {
  const to = msg.from;
  const file = msg.audio ?? msg.voice ?? msg.image ?? msg.document;
  const text = msg.text?.body ?? msg.image?.caption ?? msg.document?.caption ?? "";
  console.log(`[kanakku] WhatsApp (Meta) in: from ${to}, type ${msg.type}${text ? `, "${text.slice(0, 60)}"` : ""}`);

  if (!file && !msg.text) {
    await send(phoneId, to, "Send me text, a voice note or a photo 🙂");
    return;
  }

  let reply: BotReply;
  try {
    let media: Media | undefined;
    if (file) {
      if (msg.image || msg.document) await send(phoneId, to, "⏳ Reading it now. I'll send the result in a few seconds.");
      media = await download(file.id);
      if (!media) {
        await send(phoneId, to, "⚠️ Couldn't open that file. Please send it again.");
        return;
      }
    }
    reply = await handleMessage({ text, media, source: "whatsapp" });
  } catch (e) {
    reply = { kind: "error", reply: `⚠️ ${(e as Error).message}` };
  }
  await send(phoneId, to, reply.reply);
}

const auth = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` });

async function download(mediaId: string): Promise<Media | undefined> {
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth() });
    const info = (await meta.json()) as { url?: string; mime_type?: string; error?: { message: string } };
    if (!meta.ok || !info.url) {
      console.error(`[kanakku] Meta media lookup failed: ${info.error?.message ?? meta.status}`);
      return undefined;
    }
    const file = await fetch(info.url, { headers: auth() });
    if (!file.ok) {
      console.error(`[kanakku] Meta media download failed: ${file.status}`);
      return undefined;
    }
    return { mimeType: info.mime_type ?? file.headers.get("content-type") ?? "application/octet-stream", data: Buffer.from(await file.arrayBuffer()).toString("base64") };
  } catch (e) {
    console.error(`[kanakku] Meta media download error: ${(e as Error).message}`);
    return undefined;
  }
}

async function send(phoneId: string, to: string, body: string) {
  if (!process.env.WHATSAPP_TOKEN || !phoneId) return console.error("[kanakku] Can't reply: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing");
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: body.slice(0, 4000) } }),
    });
    const out = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code: number; message: string } };
    if (res.ok) return console.log(`[kanakku] WhatsApp (Meta) reply sent: ${out.messages?.[0]?.id}`);
    const hint =
      out.error?.code === 190 ? " → the access token expired. Generate a new one in Meta → WhatsApp → API Setup and update WHATSAPP_TOKEN." :
      out.error?.code === 131030 ? " → this phone isn't in the test number's allowed list. Add it under API Setup → To." :
      "";
    console.error(`[kanakku] Meta send FAILED (${res.status}) code ${out.error?.code}: ${out.error?.message}${hint}`);
  } catch (e) {
    console.error(`[kanakku] Couldn't reach Meta: ${(e as Error).message}`);
  }
}
