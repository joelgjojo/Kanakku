/* eslint-disable @typescript-eslint/no-explicit-any */
// End-to-end check of a running Kanakku: AI, bills, pattu, stock, bot, dashboard and the WhatsApp webhook.
//   npm run test:app                                  (checks http://localhost:3000)
//   npm run test:app -- https://kanakku.vercel.app    (checks the deployed app)
// It adds one test bill, one payment and some stock. Reset the demo before going on stage.
import crypto from "crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;

async function check(name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  try {
    const note = await fn();
    console.log(`✓ ${name}  (${Date.now() - t} ms)${note ? `\n    ${note}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${(e as Error).message}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function json<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${path}: ${body.slice(0, 200)}`);
  return JSON.parse(body) as T;
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return { method: "POST", body: f };
};
const bot = (text: string) => json<{ kind: string; reply: string }>("/api/bot", form({ text }));

console.log(`Checking ${BASE}\n`);

let status: any;
await check("App is up", async () => {
  status = await json("/api/status");
  return `AI: ${status.ai} · database: ${status.store} · WhatsApp keys: ${status.whatsapp ? "yes" : "no"}`;
});
if (!status) {
  console.log("\nThe app isn't reachable. Start it with npm run dev (or check the URL) and run this again.");
  process.exit(1);
}
if (status.ai !== "gemini") console.log("  ! GEMINI_API_KEY isn't set on this server, so voice and photos won't work.");
if (BASE.startsWith("https") && status.store !== "supabase") console.log("  ! Deployed without Supabase: data will reset. Add the Supabase env vars.");

let parsed: any;
await check("AI reads a Malayalam bill", async () => {
  parsed = await json("/api/ai/parse", form({ text: "രാജന് 2 കിലോ പഞ്ചസാര, ഒരു സോപ്പ്, പറ്റ്" }));
  const ids = parsed.items.map((i: any) => i.productId);
  assert(ids.includes("p-sugar") && ids.includes("p-soap"), `items were ${JSON.stringify(parsed.items.map((i: any) => i.name))}`);
  assert(parsed.parsed.paymentMode === "credit", `payment mode was ${parsed.parsed.paymentMode}, expected credit`);
  assert(/rajan/i.test(parsed.parsed.customerName ?? ""), `customer was ${parsed.parsed.customerName}`);
  return `engine: ${parsed.parsed.engine}`;
});

let billNo = 0;
await check("Save the bill (stock down, pattu up)", async () => {
  assert(parsed, "skipped: parsing failed");
  const before = (await json("/api/products")).products.find((p: any) => p.id === "p-sugar").stock;
  const r = await json("/api/bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: parsed.items, customerName: "Rajan", paymentMode: "credit", source: "text", rawInput: "smoke test" }),
  });
  billNo = r.bill.number;
  const after = (await json("/api/products")).products.find((p: any) => p.id === "p-sugar").stock;
  assert(Math.abs(before - 2 - after) < 0.001, `sugar stock went ${before} → ${after}, expected −2`);
  return `bill #${billNo}, ₹${r.bill.total}, Rajan owes ₹${r.due}`;
});

await check("Bill shows in Rajan's pattu page", async () => {
  const c = await json("/api/customers/c-rajan");
  assert(c.entries.some((e: any) => e.kind === "credit" && /പഞ്ചസാര|Sugar/.test(e.text)), "bill not found in Rajan's entries");
  return `Rajan's balance ₹${c.due}`;
});

await check("Bot: payment (Suma 300 thannu)", async () => {
  const r = await bot("Suma 300 thannu");
  assert(r.kind === "payment", r.reply);
  return r.reply.split("\n")[0];
});
await check("Bot: stock arrived (50 kilo ari vannu)", async () => {
  const r = await bot("50 kilo ari vannu");
  assert(r.kind === "restock", r.reply);
  return r.reply.split("\n")[1];
});
for (const q of ["stock", "pattu", "innathe kanakku"]) {
  await check(`Bot: question "${q}"`, async () => {
    const r = await bot(q);
    assert(r.kind === "info", r.reply);
    return r.reply.split("\n")[0];
  });
}

await check("Dashboard has today's bills", async () => {
  const d = await json("/api/dashboard");
  assert(d.today.bills > 0, "no bills today");
  assert(!billNo || d.activity.some((a: any) => a.kind === "bill"), "activity feed empty");
  return `today ₹${d.today.sales} from ${d.today.bills} bills · ${d.restock.length} items to restock · pattu ₹${d.pattu.total}`;
});

await check("WhatsApp webhook answers like Twilio expects", async () => {
  const params = new URLSearchParams({ Body: "innathe kanakku", From: "whatsapp:+910000000000", To: "whatsapp:+14155238886", NumMedia: "0" });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    // Sign the request the same way Twilio does, so the signature check is tested too.
    // Locally the server checks against PUBLIC_URL (your ngrok address); when deployed it's the app's own URL.
    const signedFor = process.argv[2] ? BASE : process.env.PUBLIC_URL || BASE;
    const url = `${signedFor.replace(/\/$/, "")}/api/whatsapp`;
    const data = [...params.keys()].sort().reduce((s, k) => s + k + params.get(k), url);
    headers["X-Twilio-Signature"] = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  }
  const res = await fetch(`${BASE}/api/whatsapp`, { method: "POST", headers, body: params.toString() });
  const body = await res.text();
  if (res.status === 403) throw new Error("Signature rejected. PUBLIC_URL on the server must be exactly the address Twilio calls, and the auth tokens must match.");
  assert(res.ok && body.includes("<Message>"), `${res.status}: ${body.slice(0, 200)}`);
  return body.replace(/<[^>]+>/g, " ").trim().split("\n")[0];
});

console.log(failed ? `\n${failed} check(s) failed. Paste this output to Claude.` : "\nEverything works. Remember: Stock → Reset to the starting demo before you present.");
process.exit(failed ? 1 : 0);
