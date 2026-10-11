// Checks the Supabase connection and loads the demo shop if the database is empty.
// Run: npm run test:db
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Supabase is not set. Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (key.startsWith("sb_publishable") || /"role":"anon"/.test(Buffer.from(key.split(".")[1] ?? "", "base64").toString())) {
  console.error("✗ That's the public (anon/publishable) key. Use the secret service_role key from Project Settings → API Keys.");
  process.exit(1);
}

const { getStore } = await import("../src/lib/store/index.ts");
const store = getStore();
console.log(`Connecting to ${url} …`);
try {
  const t = Date.now();
  const [products, customers, bills] = await Promise.all([store.listProducts(), store.listCustomers(), store.listBills()]);
  console.log(`✓ Connected in ${Date.now() - t} ms (store: ${store.kind})`);
  console.log(`  ${products.length} products, ${customers.length} customers, ${bills.length} bills`);
  console.log("\nSupabase is working. Restart npm run dev and the sidebar will say \"Saved to Supabase\".");
} catch (e) {
  const msg = (e as Error).message;
  console.error(`✗ ${msg}`);
  if (/relation .* does not exist|Could not find the table|schema cache/i.test(msg)) {
    console.error("  The tables are missing. Open Supabase → SQL Editor, paste supabase/schema.sql and press Run.");
  } else if (/Invalid API key|JWT|401/i.test(msg)) {
    console.error("  The key is wrong. Copy the service_role (secret) key again from Project Settings → API Keys.");
  }
  process.exit(1);
}
