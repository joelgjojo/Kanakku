/* eslint-disable @typescript-eslint/no-explicit-any */
// How accurate is Kanakku? Runs 36 real shop sentences and scores every answer.
//   npm run test:eval                                   (the app on http://localhost:3000, with Gemini)
//   npm run test:eval -- https://kanakku-kappa.vercel.app
//   npm run test:eval -- --offline                      (the no-internet parser only, no server needed)
// A case counts as right only if the intent, every item, every quantity, the customer and cash/UPI/pattu are all right.
import { offlineParse } from "../src/lib/ai/offline";
import { buildSeed } from "../src/lib/seed";

type Lang = "Malayalam" | "Manglish" | "English" | "Hindi" | "Mixed";
interface Case {
  text: string;
  lang: Lang;
  intent: string;
  items?: Record<string, number>; // productId → qty
  customer?: string;
  mode?: "cash" | "upi" | "credit";
  amount?: number;
}

const CASES: Case[] = [
  // Malayalam script
  { lang: "Malayalam", text: "രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്", intent: "sale", items: { "p-sugar": 2 }, customer: "Rajan", mode: "credit" },
  { lang: "Malayalam", text: "അര കിലോ പരിപ്പും ഒരു സോപ്പും", intent: "sale", items: { "p-dal": 0.5, "p-soap": 1 }, mode: "cash" },
  { lang: "Malayalam", text: "സുമയ്ക്ക് 3 പാൽ, 10 മുട്ട, പറ്റിൽ എഴുതിക്കോ", intent: "sale", items: { "p-milk": 3, "p-egg": 10 }, customer: "Suma", mode: "credit" },
  { lang: "Malayalam", text: "രണ്ട് കിലോ മട്ട അരി, ഒരു ലിറ്റർ വെളിച്ചെണ്ണ", intent: "sale", items: { "p-matta-rice": 2, "p-coconut-oil": 1 }, mode: "cash" },
  { lang: "Malayalam", text: "കാൽ കിലോ ചെറിയ ഉള്ളി, ഒരു തീപ്പെട്ടി", intent: "sale", items: { "p-small-onion": 0.25, "p-matchbox": 1 } },
  { lang: "Malayalam", text: "ലീല ടീച്ചർക്ക് ഒരു ചായപ്പൊടി, രണ്ട് ബിസ്കറ്റ് പറ്റ്", intent: "sale", items: { "p-tea": 1, "p-biscuit": 2 }, customer: "Leela", mode: "credit" },
  { lang: "Malayalam", text: "ബാബു 500 തന്നു", intent: "payment", customer: "Babu", amount: 500 },
  { lang: "Malayalam", text: "25 കിലോ പഞ്ചസാര വന്നു", intent: "restock", items: { "p-sugar": 25 } },
  { lang: "Malayalam", text: "ഇന്നത്തെ കണക്ക്", intent: "summary" },
  { lang: "Malayalam", text: "സ്റ്റോക്ക് എന്തൊക്കെ തീരാറായി", intent: "stock_query" },
  // Manglish
  { lang: "Manglish", text: "2 kilo ari, oru soap, rajan pattu", intent: "sale", items: { "p-matta-rice": 2, "p-soap": 1 }, customer: "Rajan", mode: "credit" },
  { lang: "Manglish", text: "ara kilo parippu, 6 mutta gpay", intent: "sale", items: { "p-dal": 0.5, "p-egg": 6 }, mode: "upi" },
  { lang: "Manglish", text: "shaji chettan 2 milma, 1 surf pattu", intent: "sale", items: { "p-milk": 2, "p-detergent": 1 }, customer: "Shaji", mode: "credit" },
  { lang: "Manglish", text: "500 gram cherupayar, 1 kg atta", intent: "sale", items: { "p-green-gram": 0.5, "p-atta": 1 } },
  { lang: "Manglish", text: "Suma 300 thannu", intent: "payment", customer: "Suma", amount: 300 },
  { lang: "Manglish", text: "50 kilo ari vannu", intent: "restock", items: { "p-matta-rice": 50 } },
  { lang: "Manglish", text: "pattu list", intent: "credit_query" },
  { lang: "Manglish", text: "ee aazhcha laabham etra?", intent: "question" },
  // English
  { lang: "English", text: "Rajan 2 kg sugar and a soap on credit", intent: "sale", items: { "p-sugar": 2, "p-soap": 1 }, customer: "Rajan", mode: "credit" },
  { lang: "English", text: "half kg toor dal, 12 eggs, paid by gpay", intent: "sale", items: { "p-dal": 0.5, "p-egg": 12 }, mode: "upi" },
  { lang: "English", text: "3 packets milk, 2 biscuits", intent: "sale", items: { "p-milk": 3, "p-biscuit": 2 }, mode: "cash" },
  { lang: "English", text: "Ammu paid 1000", intent: "payment", customer: "Ammu", amount: 1000 },
  { lang: "English", text: "20 packets tea powder arrived", intent: "restock", items: { "p-tea": 20 } },
  { lang: "English", text: "what's running low?", intent: "stock_query" },
  { lang: "English", text: "who owes me money?", intent: "credit_query" },
  { lang: "English", text: "which item made the most profit this week?", intent: "question" },
  // Hindi (helpers from other states)
  { lang: "Hindi", text: "Rajan ko 2 kilo cheeni aur ek sabun udhaar", intent: "sale", items: { "p-sugar": 2, "p-soap": 1 }, customer: "Rajan", mode: "credit" },
  { lang: "Hindi", text: "do kilo chawal, ek doodh", intent: "sale", items: { "p-matta-rice": 2, "p-milk": 1 }, mode: "cash" },
  { lang: "Hindi", text: "राजन को 2 किलो चीनी उधार", intent: "sale", items: { "p-sugar": 2 }, customer: "Rajan", mode: "credit" },
  { lang: "Hindi", text: "Suma ne 300 diya", intent: "payment", customer: "Suma", amount: 300 },
  { lang: "Hindi", text: "50 kilo chawal aaya", intent: "restock", items: { "p-matta-rice": 50 } },
  { lang: "Hindi", text: "aaj ka hisaab", intent: "summary" },
  // Mixed and tricky
  { lang: "Mixed", text: "Babu 1 kg savala, 2 Lux, cash", intent: "sale", items: { "p-onion": 1, "p-soap": 2 }, customer: "Babu", mode: "cash" },
  { lang: "Mixed", text: "മിൽമ 2, rice 3 kg", intent: "sale", items: { "p-milk": 2, "p-matta-rice": 3 } },
  { lang: "Mixed", text: "teacher 1 paal pattu", intent: "sale", items: { "p-milk": 1 }, customer: "Leela", mode: "credit" },
  { lang: "Mixed", text: "ആട്ട 1 kg, റവ അര കിലോ, ഉപ്പ് 1", intent: "sale", items: { "p-atta": 1, "p-rava": 0.5, "p-salt": 1 } },
];

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const BASE = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:3000").replace(/\/$/, "");
const GAP = Number(args.find((a) => a.startsWith("--gap="))?.slice(6) ?? (offline ? 0 : 2500)); // stay under Gemini's free per-minute limit
const seed = buildSeed();

async function parse(text: string): Promise<any> {
  if (offline) return offlineParse(text, seed.products, seed.customers);
  const f = new FormData();
  f.append("text", text);
  const res = await fetch(`${BASE}/api/ai/parse`, { method: "POST", body: f });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.parsed;
}

function score(c: Case, p: any): string[] {
  const wrong: string[] = [];
  if (p.intent !== c.intent) wrong.push(`intent ${p.intent}, expected ${c.intent}`);
  if (c.items) {
    const got = new Map<string, number>();
    for (const i of p.items ?? []) got.set(i.productId, (got.get(i.productId) ?? 0) + Number(i.qty));
    for (const [id, qty] of Object.entries(c.items)) {
      const g = got.get(id);
      if (g === undefined) wrong.push(`missed ${id.slice(2)}`);
      else if (Math.abs(g - qty) > 0.001) wrong.push(`${id.slice(2)} qty ${g}, expected ${qty}`);
    }
    for (const id of got.keys()) if (!(id in c.items)) wrong.push(`extra ${String(id).slice(2)}`);
  }
  if (c.customer && !String(p.customerName ?? "").toLowerCase().includes(c.customer.toLowerCase())) wrong.push(`customer ${p.customerName ?? "none"}, expected ${c.customer}`);
  if (c.mode && p.paymentMode !== c.mode) wrong.push(`paid by ${p.paymentMode}, expected ${c.mode}`);
  if (c.amount && Number(p.amount) !== c.amount) wrong.push(`amount ${p.amount}, expected ${c.amount}`);
  return wrong;
}

console.log(`Kanakku accuracy test: ${CASES.length} sentences · ${offline ? "offline parser (no AI)" : `AI via ${BASE}`}\n`);
if (!offline) {
  const st = await fetch(`${BASE}/api/status`).then((r) => r.json()).catch(() => null);
  if (!st) { console.log(`Can't reach ${BASE}. Start the app (npm run dev) or pass the deployed URL.`); process.exit(1); }
  if (st.ai !== "gemini") console.log("! This server has no GEMINI_API_KEY, so this measures the offline parser.\n");
}

const results: { c: Case; ok: boolean; ms: number; wrong: string[] }[] = [];
for (const c of CASES) {
  const t = Date.now();
  let wrong: string[];
  try {
    wrong = score(c, await parse(c.text));
  } catch (e) {
    wrong = [`error: ${(e as Error).message.slice(0, 80)}`];
  }
  const ms = Date.now() - t;
  results.push({ c, ok: !wrong.length, ms, wrong });
  console.log(`${wrong.length ? "✗" : "✓"} ${c.lang.padEnd(9)} ${(ms / 1000).toFixed(1).padStart(4)}s  ${c.text}${wrong.length ? `\n      ${wrong.join("; ")}` : ""}`);
  if (GAP) await new Promise((r) => setTimeout(r, GAP));
}

const right = results.filter((r) => r.ok).length;
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
console.log(`\nAll right: ${right} of ${results.length} (${pct(right, results.length)})`);
for (const lang of ["Malayalam", "Manglish", "English", "Hindi", "Mixed"] as Lang[]) {
  const r = results.filter((x) => x.c.lang === lang);
  console.log(`  ${lang.padEnd(9)} ${r.filter((x) => x.ok).length}/${r.length}`);
}
const bills = results.filter((r) => r.c.intent === "sale");
console.log(`Bills fully right: ${bills.filter((r) => r.ok).length} of ${bills.length}`);
console.log(`Time per message: median ${(median / 1000).toFixed(1)} s`);
console.log(`\nFor the slide: "Kanakku got ${right} of ${results.length} real shop messages exactly right, in Malayalam, Manglish, English and Hindi, in about ${(median / 1000).toFixed(1)} seconds each."`);
