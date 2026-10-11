// Kanakku WhatsApp bridge
// Links a normal WhatsApp number (like WhatsApp Web) and forwards every message to Kanakku.
// No Meta/Twilio account needed. Keep this running on a laptop during the demo.
//
//   cd bridge && npm install && npm start
//
// Settings (in bridge/.env or ../.env.local):
//   KANAKKU_URL    = https://kanakku-kappa.vercel.app   (where Kanakku runs)
//   BRIDGE_ALLOW   = 918943262406,91XXXXXXXXXX          (only these numbers get replies; recommended)
//   BRIDGE_PHONE   = 91XXXXXXXXXX                        (optional: the bridge's own number, to link with a code instead of a QR)
//
// Use a spare number. WhatsApp doesn't officially allow bots on normal accounts, so a number can get banned.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidGroup,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "baileys";
import P from "pino";
import qrcode from "qrcode-terminal";

const here = path.dirname(fileURLToPath(import.meta.url));

// Tiny .env loader (bridge/.env first, then the app's .env.local)
for (const file of [path.join(here, ".env"), path.join(here, "..", ".env.local")]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const KANAKKU_URL = (process.env.KANAKKU_URL || "https://kanakku-kappa.vercel.app").replace(/\/$/, "");
const ALLOW = (process.env.BRIDGE_ALLOW || "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
const PAIR_PHONE = (process.env.BRIDGE_PHONE || "").replace(/\D/g, "");
const AUTH_DIR = path.join(here, "auth");
const logger = P({ level: "silent" });

const say = (...a) => console.log(new Date().toLocaleTimeString("en-IN"), ...a);

console.log(`\n🧾 Kanakku WhatsApp bridge`);
console.log(`   Kanakku: ${KANAKKU_URL}`);
console.log(ALLOW.length ? `   Replies only to: ${ALLOW.join(", ")}, plus anyone who sends "join kanakku"` : `   ⚠️  Replies to EVERYONE who messages this number. Set BRIDGE_ALLOW to limit it.`);

const digits = (jid) => (jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

// People who sent the join code are remembered here, so judges can opt in on the spot.
const JOINED_FILE = path.join(here, "joined.json");
const joined = new Set(fs.existsSync(JOINED_FILE) ? JSON.parse(fs.readFileSync(JOINED_FILE, "utf8")) : []);
const JOIN_CODE = /^\s*(join\s+)?kanakku\s*!?\s*$/i;
const allowed = (...jids) =>
  !ALLOW.length ||
  jids.some((j) => j && (joined.has(j) || ALLOW.some((a) => digits(j).endsWith(a.slice(-10)))));
const seen = new Set();

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);

  let pairingAsked = false;
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && !state.creds.registered) {
      if (PAIR_PHONE && !pairingAsked) {
        pairingAsked = true;
        try {
          const code = await sock.requestPairingCode(PAIR_PHONE);
          console.log(`\n🔗 On the bridge phone: WhatsApp → Settings → Linked devices → Link a device → "Link with phone number instead"`);
          console.log(`   Enter this code: ${code.match(/.{1,4}/g).join("-")}\n`);
        } catch (e) {
          console.log(`Couldn't get a pairing code (${e.message}). Scan the QR instead:`);
          qrcode.generate(qr, { small: true });
        }
      } else if (!PAIR_PHONE) {
        console.log(`\n📱 On the bridge phone: WhatsApp → Settings → Linked devices → Link a device, and scan:\n`);
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === "open") say(`✅ Connected as ${digits(sock.user?.id)}. Send a message to this number to test.`);
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        say("❌ Logged out from the phone. Delete the bridge/auth folder and run npm start again to relink.");
        process.exit(1);
      }
      say(`Connection closed (${code ?? "network"}). Reconnecting…`);
      setTimeout(start, code === DisconnectReason.restartRequired ? 0 : 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!m.message || m.key.fromMe || !jid) continue;
      if (isJidGroup(jid) || jid === "status@broadcast" || jid.endsWith("@newsletter") || jid.endsWith("@broadcast")) continue;
      if (seen.has(m.key.id)) continue;
      seen.add(m.key.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value);
      if (!allowed(jid, m.key.remoteJidAlt)) {
        const body = normalizeMessageContent(m.message)?.conversation || normalizeMessageContent(m.message)?.extendedTextMessage?.text || "";
        if (JOIN_CODE.test(body)) {
          joined.add(jid);
          fs.writeFileSync(JOINED_FILE, JSON.stringify([...joined]));
          say(`➕ ${digits(m.key.remoteJidAlt || jid)} joined with the code`);
          m.message = { conversation: "hi" }; // answer with the welcome menu
        } else {
          say(`Ignored message from ${digits(m.key.remoteJidAlt || jid)} (not allowed; they can send "join kanakku")`);
          continue;
        }
      }
      handle(sock, m).catch((e) => say(`⚠️ ${e.message}`));
    }
  });
}

async function handle(sock, m) {
  const jid = m.key.remoteJid;
  const msg = normalizeMessageContent(m.message) || {};
  const image = msg.imageMessage;
  const audio = msg.audioMessage;
  const doc = msg.documentMessage;
  const text = msg.conversation || msg.extendedTextMessage?.text || image?.caption || doc?.caption || "";
  // Only answer recent messages, never a backlog that arrives after reconnecting.
  const sentAt = Number(m.messageTimestamp || 0) * 1000;
  if (sentAt && Date.now() - sentAt > 5 * 60_000) return;
  const from = digits(m.key.remoteJidAlt || jid);

  if (!text && !image && !audio && !doc) return;
  say(`📩 ${from}: ${audio ? "🎤 voice note" : image ? "🖼️ photo" : doc ? "📄 file" : ""} ${text}`.trim());

  await sock.readMessages([m.key]).catch(() => {});
  await sock.sendPresenceUpdate(audio ? "recording" : "composing", jid).catch(() => {});

  const form = new FormData();
  if (text) form.append("text", text);
  if (image || audio || doc) {
    if (image || doc) await sock.sendMessage(jid, { text: "⏳ Reading it now. I'll send the result in a few seconds." });
    const buf = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
    const mime = (image?.mimetype || audio?.mimetype || doc?.mimetype || "application/octet-stream").split(";")[0];
    form.append("media", new Blob([buf], { type: mime }), audio ? "voice.ogg" : image ? "photo.jpg" : doc?.fileName || "file");
  }

  let reply;
  try {
    const res = await fetch(`${KANAKKU_URL}/api/bot`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
    const data = await res.json().catch(() => ({}));
    reply = data.reply || data.error || `Kanakku returned ${res.status}`;
  } catch (e) {
    reply = `⚠️ Can't reach Kanakku right now (${e.name === "TimeoutError" ? "timed out" : e.message}).`;
  }

  // Reply at a human pace: a short "typing…" pause scaled to the reply length.
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
  await new Promise((r) => setTimeout(r, 900 + Math.min(1600, reply.length * 6) + Math.random() * 600));
  await sock.sendPresenceUpdate("paused", jid).catch(() => {});
  await sock.sendMessage(jid, { text: reply }, { quoted: m });
  say(`📤 replied to ${from}: ${reply.split("\n")[0].slice(0, 70)}`);
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
