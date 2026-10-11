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
| **Customer pattu page + UPI pay** | Each customer gets a private link showing their own pattu account with a "Pay ₹X with UPI" button and QR. Reminders include it. | `/k/<code>`, `/pattu` |
| **Trust score & credit limit** | Every pattu customer is scored from their real repayment history (how fast they pay, oldest unpaid bill) with a suggested limit. Billing past the limit warns the shopkeeper, in the app and on WhatsApp. | `/pattu`, `/bill` |
| **Supplier bill → real profit** | Photograph the wholesaler's bill. Stock is added, cost prices are learned, and profit per item and per day appears. Warns when a margin is too thin or a supplier raised a price. | `/purchase`, WhatsApp photo with caption "bill" |
| **Ask Kanakku** | Ask anything about the shop by typing or voice, in Malayalam or English: "ഈ ആഴ്ച ലാഭം എത്ര?", "who should I stop giving pattu to?". Answers come from the shop's own numbers. | Today page, WhatsApp |
| **Close the day** | Count the cash drawer; Kanakku says if it's short or extra, and by how much. | Today page |
| **Loan-ready report** | A printable 4-week business summary (sales, consistency, growth, margin, collection rate) a bank officer can read for a MUDRA loan. Small shops usually have no records to show. | `/report` |
| **Kanakku messages first** | No need to ask. At 8 am the owner gets "order these today, collect pattu from these people, yesterday vs last week" on WhatsApp; at 9 pm, the day's sales, profit and what the cash drawer should hold. | WhatsApp bridge (`DIGEST_MORNING`, `DIGEST_EVENING`), or send `morning` / `evening` |
| **Hindi for shop helpers** | Many Kerala shops have helpers from other states. They can bill in Hindi ("Rajan ko 2 kilo cheeni udhaar", "Suma ne 300 diya") and get replies in Hindi. Bengali and Tamil are understood too. | WhatsApp, `/bill` |
| **Full Malayalam app** | One switch (English / മലയാളം) turns every main screen into Malayalam for owners who don't read English. | sidebar / top bar |
| **Works offline** | No internet: typed bills still parse (rule-based Malayalam/Manglish parser), and saved bills queue on the phone until the connection is back. | everywhere |

The bot also understands:

- `Suma 300 thannu`: records a payment
- `50 kilo ari vannu`: adds delivered stock
- `stock`, `pattu`, `innathe kanakku`: answers with low stock, credit list, or today's summary
- A photo with the caption `shelf`: runs a shelf check instead of reading a notebook
- `morning` / `evening`: the daily plan and the day-close message
- `namaste`: the menu in Hindi

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
| `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` (optional) | Backup free keys from teammates' Google accounts. A free key has a daily limit; when one runs out, Kanakku moves to the next key by itself. Strongly recommended for demo day. | Same page, signed in as a teammate |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Cloud database (needed on Vercel so data survives restarts) | supabase.com → new project → run `supabase/schema.sql` in the SQL editor |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_VERIFY_TOKEN` | A real WhatsApp number (free) | Meta WhatsApp Cloud API test number (steps below) |

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

### Updating an existing Supabase database

If your Supabase tables were created before cost prices existed, run this once in **SQL Editor**:

```sql
alter table products add column if not exists cost_price numeric;
```

Then **Stock → Reset to the starting demo** to load demo data with cost prices and realistic pattu habits.

For the UPI pay button, set `NEXT_PUBLIC_UPI_ID` (for example `yourname@okaxis`) in `.env.local` and in Vercel. Payments go straight to that UPI ID, so use one your team controls.

### Lock the shop with a PIN

Out of the box anyone with the link can see and change the shop's data. To lock it, set `SHOP_PIN` (6 digits or more) in `.env.local` and in Vercel, then redeploy.

- Every page and API needs the PIN; the phone stays logged in for 30 days. Wrong guesses are slowed down.
- Customers' pattu pages (`/k/...`), the privacy page and the signed WhatsApp webhooks stay public.
- The WhatsApp bridge reads `SHOP_PIN` from `bridge/.env` (or `.env.local`) and sends it, so add it there too and restart `npm run whatsapp`. The test scripts send it the same way.

### Bills are never lost or doubled offline

Each bill gets its own id on the phone before it's sent. If the connection drops, the bill waits on the phone and is sent again later; if the server had already saved it, the repeat is recognised and not added twice. A bill leaves the phone only when the server confirms it, and one the server refuses is shown with **Try again** / **Discard** instead of being thrown away.

### Before going on stage

Go to **Stock → Reset to the starting demo** so the numbers are clean.

### Test everything

With the app running (`npm run dev`), in a second terminal:

```bash
npm run test:app                                  # checks your laptop
npm run test:app -- https://your-app.vercel.app   # checks the deployed app
```

It checks the AI, saving a bill, stock, pattu, every bot command, the dashboard and the WhatsApp webhook (including Twilio's signature). It adds one test bill, so **reset the demo** afterwards.

### How accurate is it? (numbers for the slide)

```bash
npm run test:eval -- https://kanakku-kappa.vercel.app   # Gemini, through the live app
npm run test:eval -- --offline                         # the no-internet parser only
```

36 real shop messages in Malayalam, Manglish, English and Hindi. A message counts as right only if the intent, every item and quantity, the customer and cash/UPI/pattu are all right. It prints the score per language, the time per message, and a ready line for the slide. The offline parser was tuned on these same sentences, so for an honest number also add 10 to 20 new sentences from a real shopkeeper to `CASES` in `scripts/eval.mts` and run it again.

### Go live: Vercel + real WhatsApp

**1. Deploy (10 min)**
1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import `Kanakku` → **Deploy**.
2. **Settings → Environment Variables**: add everything from `.env.local` (`GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SHOP_NAME`). Leave the Twilio ones for step 2.
3. **Deployments → ⋯ → Redeploy** so the keys take effect. Open the link: the sidebar should show green dots for Gemini and Supabase.
4. `vercel.json` runs the app in Mumbai (`bom1`), next to the Supabase database, so pages load fast.

**2. Real WhatsApp with no Facebook account: the bridge (10 min)**

A small script on your laptop links a normal WhatsApp number to Kanakku, exactly like WhatsApp Web. No Meta, Twilio or card needed.

1. Get a **spare WhatsApp number** on a phone (an old number or a second SIM). This is the number shopkeepers will message. **Don't use your main number**: WhatsApp doesn't officially allow bots on normal accounts, so it could get banned.
2. Copy `bridge/.env.example` to `bridge/.env` and set `BRIDGE_ALLOW` to the numbers that should get replies (yours, teammates', the demo phone), comma separated, with country code and no `+`.
3. Run:
   ```bash
   npm run whatsapp
   ```
4. A QR code appears in the terminal. On the spare phone: **WhatsApp → Settings → Linked devices → Link a device**, then scan it. (Or set `BRIDGE_PHONE` in `bridge/.env` to get an 8-digit code instead of a QR.)
5. When it says **✅ Connected**, send "hi" to the spare number from your own phone. Kanakku replies.

The login is saved in `bridge/auth/`, so next time `npm run whatsapp` connects straight away. Keep the laptop awake and the terminal open during the demo. The bridge talks to the deployed app (`KANAKKU_URL`), so bills still show up live on the dashboard.

The bridge also sends the owner the daily messages: the morning plan at `DIGEST_MORNING` (default 08:00) and the day close at `DIGEST_EVENING` (default 21:00), to `BRIDGE_OWNER` (default: the first number in `BRIDGE_ALLOW`). To show it on stage, type `m` or `e` and press Enter in the bridge terminal.

**Official alternatives (need an account in good standing):**
- **Meta Cloud API** at `/api/whatsapp/meta`: needs a Facebook account Meta trusts. A brand-new account gets its WhatsApp Business Account locked (error 131031).
- **Twilio** at `/api/whatsapp`: a trial account can't send replies, so it only works on an upgraded (paid) account.

<details><summary>Meta Cloud API setup (if you have an established Facebook account)</summary>

Meta gives every developer a free test WhatsApp number that can chat with up to 5 phones. No card, no Twilio.

1. Go to [developers.facebook.com](https://developers.facebook.com), log in with Facebook, and register as a developer if asked.
2. **My Apps → Create App**. Choose use case **Other**, then app type **Business**. Name it `Kanakku`. If it asks for a business portfolio, let it create one.
3. On the app page, find **WhatsApp** and click **Set up**.
4. Open **WhatsApp → API Setup**. You'll see a **test number**, its **Phone number ID**, and a **temporary access token**.
5. Under **To**, click **Manage phone number list** and add every phone that will use the bot (yours, teammates', the demo phone). Each gets a code on WhatsApp to confirm.
6. In Vercel **Environment Variables**, add:
   - `WHATSAPP_TOKEN` = the access token
   - `WHATSAPP_PHONE_NUMBER_ID` = the Phone number ID (not the phone number)
   - `WHATSAPP_VERIFY_TOKEN` = any secret word you choose, e.g. `kanakku-kada-2026`
   - optional: `META_APP_SECRET` = **App settings → Basic → App secret**

   Then **Redeploy**.
7. Back in Meta: **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://your-app.vercel.app/api/whatsapp/meta`
   - Verify token: the same secret word
   - Click **Verify and save**, then under **Webhook fields** click **Manage** and subscribe to **messages**.
8. On your phone, send "hi" to the test number. Kanakku replies with its menu.

**The temporary token expires every 24 hours.** On demo day, either copy a fresh one into Vercel and redeploy, or make a permanent one: **business.facebook.com → Settings → Users → System users → Add** (Admin), then **Assign assets** (your app, full control), then **Generate new token** with permissions `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. Use that as `WHATSAPP_TOKEN`.

**If WhatsApp doesn't reply**, open Vercel → **Logs**, search `kanakku`, and read the line:
- `token expired` (code 190): paste a new access token into Vercel and redeploy.
- code 131030: that phone isn't in the **To** list on API Setup.
- No `WhatsApp (Meta) in` line at all: the webhook isn't subscribed to **messages**, or the callback URL is wrong.

Twilio is still supported at `/api/whatsapp`, but a Twilio **trial** account can't send replies (it demands message templates and then refuses to create them), so it only works on an upgraded account.

</details>

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
    digest.ts           The morning and evening messages Kanakku sends by itself
    i18n.tsx            English / Malayalam switch for the app
    seed.ts             Demo shop: 20 products, 6 customers, 28 days of bills
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
6. **It messages you first (15 s).** In the bridge terminal type `m` + Enter. The owner's phone buzzes with the morning plan: what to order, whose pattu to collect. "Nobody had to open an app."
7. **Close (20 s).** "Zero behaviour change. The shopkeeper keeps his notebook and WhatsApp. We do the accounts."

**Backup:** record a screen video of the full flow the night before, in case the stage Wi-Fi fails. The offline parser still bills typed text with no internet.
