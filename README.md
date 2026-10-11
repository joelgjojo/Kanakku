# Kanakku · കണക്ക്

**An AI bookkeeper for Kerala's small shops that works through the two things shopkeepers already use: their notebook and WhatsApp.**

> ബുക്ക് മാറ്റണ്ട, ശീലം മാറ്റണ്ട, കണക്ക് ഞങ്ങൾ നോക്കിക്കോളാം.
> Don't change your book, don't change your habits. We'll handle the accounts.

Problem statement: **Small Business and Local Commerce, #1: Manual billing and stock tracking.**

---

## What it does

| Feature | How the shopkeeper uses it | Where |
|---|---|---|
| **Voice billing** | Taps the mic and says "രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്". The bill appears, stock goes down, Rajan's pattu goes up. | `/bill` |
| **WhatsApp bot** | Sends a voice note, text, or photo to the shop's WhatsApp number. Gets the bill back. | `/whatsapp` (simulator) + `/api/whatsapp` (real number) |
| **Notebook photo to ledger** | Photographs a handwritten page. Every line becomes a sale or payment. | `/notebook` |
| **Pattu (credit) book** | Sees who owes what and for how long, records payments, sends a polite Malayalam reminder. | `/pattu` |
| **Stock and restock forecast** | Sees what runs out in the next few days, sends the supplier an order in one tap. | `/stock`, `/` |
| **Shelf check** | Photographs a shelf. Kanakku counts it and flags gaps against the records (unbilled sales, theft, damage). | `/shelf` |
| **Works offline** | No internet: typed bills still parse (rule-based Malayalam/Manglish parser), and saved bills queue on the phone until the connection is back. | everywhere |

The bot also understands:

- `Suma 300 thannu`: records a payment
- `50 kilo ari vannu`: adds delivered stock
- `stock`, `pattu`, `innathe kanakku`: answers with low stock, credit list, or today's summary
- A photo with the caption `shelf`: runs a shelf check instead of reading a notebook

---

## Run it (5 minutes)

You need [Node.js 20+](https://nodejs.org).

```bash
git clone https://github.com/joelgjojo/Kanakku.git
cd Kanakku
npm install
cp .env.example .env.local     # then paste your Gemini key into it
npm run dev
```

Check the AI key before anything else:

```bash
npm run test:ai      # parses 3 Malayalam/Manglish bills with Gemini and prints the result
npm run test:db      # only after setting up Supabase (below)
```

Open http://localhost:3000. A demo shop (Ammu Stores, Kollam) with two weeks of history loads by itself.

**It runs with zero keys.** Without a Gemini key, typed bills use the offline parser, and voice, notebook, and shelf show a clear message. With the key, everything works.

### Keys

| Key | Needed for | Get it |
|---|---|---|
| `GEMINI_API_KEY` | Voice, notebook photos, shelf check, smarter parsing | Free at https://aistudio.google.com/apikey (new keys start with `AQ.`, which is fine) |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Cloud database (needed on Vercel so data survives restarts) | supabase.com → new project → run `supabase/schema.sql` in the SQL editor |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `PUBLIC_URL` | A real WhatsApp number | Twilio WhatsApp sandbox (steps on the `/whatsapp` page) |

Without Supabase, data is saved to `.data/kanakku.json` on your laptop. That's fine for a demo run entirely from one laptop.

### Supabase setup (10 minutes)

1. Go to [supabase.com](https://supabase.com), sign in with GitHub, and click **New project**. Pick region **Mumbai (ap-south-1)** and save the database password somewhere.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API Keys** (or **Data API**). Copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **service_role / secret** key → `SUPABASE_SERVICE_ROLE_KEY` (not the anon/publishable one)
4. Paste both into `.env.local`, then run `npm run test:db`. The first run loads the demo shop into the database.
5. Restart `npm run dev`. The sidebar should say **Saved to Supabase**.

The service_role key can read and write everything. Keep it only in `.env.local` and in Vercel's environment variables. Never put it in the code or in a chat.

### Before going on stage

Go to **Stock → Reset to the starting demo** so the numbers are clean.

### Deploy

1. Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add the env vars.
2. Use Supabase on Vercel: the local JSON file resets whenever Vercel restarts the server.
3. Set `PUBLIC_URL` to your Vercel URL and point the Twilio sandbox webhook to `https://<your-app>/api/whatsapp`.

---

## How it works

```
 Shopkeeper                       Kanakku (Next.js)                         Gemini
 ──────────                       ─────────────────                         ──────
 🎤 mic in browser ──WAV──▶ /api/ai/parse ─┐
 💬 WhatsApp voice/text ─▶ /api/whatsapp ──┼─▶ lib/ai  ── prompt + catalogue ──▶ structured JSON
 📒 notebook photo ──JPEG─▶ /api/ai/notebook┘    │        (intent, items, qty,      (schema-enforced)
                                                  │         customer, pattu?)
                                                  ▼
                                   lib/kanakku.ts: createBill / recordPayment / restock
                                                  │
                                                  ▼
                                   lib/store: local JSON file  or  Supabase Postgres
                                                  │
                                                  ▼
                                   lib/analytics.ts: today, 7-day chart, forecast, pattu
                                                  │
                                                  ▼
                                   Dashboard polls every 4 s, so WhatsApp bills appear live
```

**Key ideas**

- **Structured output, never free text.** Every Gemini call passes a JSON schema (`responseJsonSchema`), so the app always gets `{intent, items[{productId, qty, unit}], customerName, paymentMode}`. The product catalogue (with Malayalam names and Manglish aliases) goes into the prompt, so "ari", "അരി", and "matta" all map to the same product.
- **Model fallback.** `lib/ai/gemini.ts` tries `gemini-3.6-flash`, then `gemini-3-flash-preview`, then `gemini-3.1-flash-lite`, so a retired model or a rate limit doesn't kill the demo.
- **Offline parser.** `lib/ai/offline.ts` handles Malayalam suffixes (`പരിപ്പും` → `പരിപ്പ്`), number words (`അര`, `രണ്ട്`, `randu`), grams to kg, and credit/UPI keywords. Test it with `npm run test:parser`.
- **Restock forecast.** Weighted moving average over 14 days (the last week counts double) → units sold per day → days of stock left → reorder quantity for one week.
- **Pattu ageing.** Payments are applied to the oldest credit first, so "oldest unpaid: 12 days" is accurate.
- **Notebook import is honest.** If the amount written in the book differs from catalogue prices, an "As written in book" line keeps the customer's balance exactly what the book says.
- **Nothing is sent without the shopkeeper.** Receipts, reminders, and supplier orders open WhatsApp with the message ready (`wa.me` links). The shopkeeper presses send.

### Code map

```
src/
  app/
    page.tsx            Today dashboard (live)
    bill/               Voice / text / tap billing
    pattu/              Credit book per customer
    stock/              Stock, forecast, restock, add items, reset demo
    notebook/           Photo → review → import
    shelf/              Shelf photo audit
    whatsapp/           Bot simulator + Twilio setup
    api/                All server routes
  lib/
    ai/                 Gemini client, prompts and schemas, offline parser
    store/              Local JSON store and Supabase store (same interface)
    kanakku.ts          Bills, payments, restock, balances
    analytics.ts        Dashboard numbers and forecasting
    bot.ts              WhatsApp brain (shared by simulator and webhook)
    seed.ts             Demo shop: 20 products, 6 customers, 14 days of bills
supabase/schema.sql     Postgres tables + atomic stock function
```

---

## Team split for the 24 hours

| Person | Owns | First thing to do |
|---|---|---|
| **AI** | `lib/ai/*`, voice quality | Get a Gemini key, record 10 real Malayalam voice notes, tune the prompt in `lib/ai/index.ts` until all 10 parse right |
| **WhatsApp + backend** | `lib/bot.ts`, `/api/whatsapp`, Supabase | Twilio sandbox + ngrok, send a voice note from a real phone |
| **Frontend** | `src/app/*` pages | Polish the Bill and Today pages on a real phone, add the app to the home screen |
| **Pitch** | Demo script, shop visit, slides | Visit 3 shops, photograph a real pattu book page (with permission), record the owner on video |

## Demo script (3 minutes)

1. **Problem (30 s).** Play the shop owner clip. "Every kada in Kerala runs on a notebook. Credit is forgotten, stock runs out, and there's no record if the book is lost."
2. **Voice bill (30 s).** On the phone: tap the mic and say "രാജന് 2 കിലോ പഞ്ചസാര, ഒരു സോപ്പ്, പറ്റ്". The bill appears. Save. Show Rajan's pattu going up.
3. **WhatsApp (40 s).** Send a voice note to the sandbox number from another phone. The reply comes back with the bill. The laptop dashboard updates live, so the judges see the bill appear.
4. **Notebook (40 s).** Photograph the real pattu book page. Lines appear for review. Add them. Point out "these were handwritten 2 minutes ago."
5. **Insight (20 s).** Today page: "Sugar runs out in 1 day. One tap sends the order to the supplier." Pattu page: one tap sends a polite Malayalam reminder.
6. **Close (20 s).** "Zero behaviour change. The shopkeeper keeps his notebook and WhatsApp. We do the accounts."

**Backup:** record a screen video of the full flow the night before, in case the stage Wi-Fi fails. The offline parser still bills typed text with no internet.
