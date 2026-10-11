// Quick check of the offline parser: npx tsx scripts/parse-test.ts
import { offlineParse } from "../src/lib/ai/offline";
import { buildSeed } from "../src/lib/seed";

const s = buildSeed();
const samples = [
  "രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്",
  "2 kg ari, oru soap rajan pattu",
  "500 gram sugar and 6 mutta gpay",
  "Suma 300 thannu",
  "50 kilo ari vannu",
  "rice 3 kg, milma 2",
  "stock",
  "അര കിലോ പരിപ്പും ഒരു സോപ്പും",
  "Leela teacher pattu 2 milk",
];
for (const t of samples) {
  const r = offlineParse(t, s.products, s.customers);
  console.log(`${t}\n  → ${r.intent} | ${r.customerName ?? "-"} | ${r.paymentMode} | ${r.amount ?? ""} | ${r.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}`);
}
