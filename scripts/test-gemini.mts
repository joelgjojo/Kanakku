// Checks that your Gemini key works and the AI understands a Malayalam bill.
// Run: npm run test:ai
import { parseMessage } from "../src/lib/ai/index.ts";
import { buildSeed } from "../src/lib/seed.ts";

process.env.KANAKKU_STRICT_AI = "1"; // show real errors instead of falling back
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("✗ GEMINI_API_KEY is empty. Put it in .env.local");
  process.exit(1);
}
console.log(`Key found (${key.slice(0, 6)}…). Asking Gemini…`);

const { products, customers } = buildSeed();
const samples = ["രാജന് 2 കിലോ പഞ്ചസാര, ഒരു സോപ്പ്, പറ്റ്", "Suma 300 thannu", "അര കിലോ പരിപ്പും 6 മുട്ടയും gpay"];

for (const text of samples) {
  const t = Date.now();
  try {
    const r = await parseMessage({ text }, products, customers);
    if (r.engine !== "gemini") throw new Error("Fell back to the offline parser: Gemini call failed");
    console.log(`\n✓ ${text}  (${Date.now() - t} ms)`);
    console.log(`  intent=${r.intent} customer=${r.customerName ?? "-"} mode=${r.paymentMode} amount=${r.amount ?? "-"}`);
    for (const i of r.items) console.log(`  • ${i.name} × ${i.qty} ${i.unit} (${i.productId ?? "not in catalogue"})`);
  } catch (e) {
    console.error(`\n✗ ${text}\n  ${(e as Error).message}`);
    process.exit(1);
  }
}
console.log("\nGemini is working. Voice, notebook photos and shelf check are ready.");
