// Rule-based parser used when there is no internet or no Gemini key.
// Handles typed Malayalam, Manglish and English like:
//   "2 kilo ari, oru soap rajan pattu"
//   "രണ്ട് കിലോ പഞ്ചസാര രാജന് പറ്റ്"
//   "Rajan paid 500"
import { findCustomer } from "../kanakku";
import type { Customer, Intent, ParsedItem, ParsedMessage, PaymentMode, Product } from "../types";

const NUM_WORDS: Record<string, number> = {
  // English
  half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, dozen: 12, fifteen: 15, twenty: 20,
  // Manglish
  ara: 0.5, oru: 1, onnu: 1, randu: 2, rand: 2, moonu: 3, munnu: 3, naalu: 4, nalu: 4, anju: 5, aaru: 6, ezhu: 7,
  ettu: 8, ombathu: 9, pathu: 10,
  // Malayalam
  "അര": 0.5, "കാൽ": 0.25, "ഒരു": 1, "ഒന്ന്": 1, "രണ്ട്": 2, "രണ്ടു": 2, "മൂന്ന്": 3, "നാല്": 4, "അഞ്ച്": 5, "ആറ്": 6,
  "ഏഴ്": 7, "എട്ട്": 8, "ഒമ്പത്": 9, "പത്ത്": 10, "ഡസൻ": 12,
};

const GRAM = /^(g|gm|gms|gram|grams|ഗ്രാം)$/;
const ML = /^(ml|മില്ലി)$/;
const CREDIT = /(pattu|pattil|പറ്റ്|പറ്റിൽ|credit|kadam|കടം|എഴുതിക്കോ|ezhuthiko|ezhuthikko)/i;
const UPI = /(upi|gpay|g pay|google pay|phonepe|paytm|ജിപേ)/i;
const PAID = /(paid|thannu|തന്നു|adachu|അടച്ചു|payment|kodutthu|കൊടുത്തു)/i;
const RESTOCK = /(vannu|വന്നു|arrived|stock in|stock vannu|delivery|ഇറക്കി|irakki)/i;

const tokenize = (s: string) =>
  s.toLowerCase().normalize("NFC").replace(/[,.;!?।]/g, " , ").replace(/(\d)([a-zഀ-ൿ])/g, "$1 $2").split(/\s+/).filter(Boolean);

function readNumber(tok: string | undefined): number | null {
  if (!tok) return null;
  if (/^\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
  // Strip Malayalam suffixes like "രണ്ടു" -> "രണ്ട്"
  return NUM_WORDS[tok] ?? null;
}

export function offlineParse(text: string, products: Product[], customers: Customer[]): ParsedMessage {
  const tokens = tokenize(text);
  const lower = text.toLowerCase();

  // Find every product mention and where it sits in the token list.
  type Hit = { at: number; len: number; product: Product };
  const hits: Hit[] = [];
  const taken = new Set<number>();
  const candidates = products
    .flatMap((p) => [p.name, p.nameMl, ...p.aliases].map((n) => ({ p, words: tokenize(n) })))
    .sort((a, b) => b.words.join(" ").length - a.words.join(" ").length); // longest names first
  for (const { p, words } of candidates) {
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if ([...Array(words.length).keys()].some((k) => taken.has(i + k))) continue;
      const ok = words.every((w, k) => {
        const t = tokens[i + k];
        // Malayalam sticks suffixes on words: "അരിയും", "പഞ്ചസാരയും". Prefix match covers that.
        if (t === w) return true;
        if (!/[\u0D00-\u0D7F]/.test(w)) return false;
        const stem = w.replace(/\u0D4D$/, ""); // drop the trailing virama: പരിപ്പ് → പരിപ്പ (+ും)
        return stem.length >= 2 && t.startsWith(stem) && t.length - stem.length <= 5;
      });
      if (ok) {
        hits.push({ at: i, len: words.length, product: p });
        words.forEach((_, k) => taken.add(i + k));
      }
    }
  }
  hits.sort((a, b) => a.at - b.at);

  const usedNums = new Set<number>();
  const items: ParsedItem[] = hits.map((h, idx) => {
    // Look left for "<number> [unit]" back to the previous item or comma; else look right.
    const leftStop = idx > 0 ? hits[idx - 1].at + hits[idx - 1].len : 0;
    let qty: number | null = null;
    let scale = 1;
    const take = (j: number) => {
      const n = readNumber(tokens[j]);
      if (n === null || usedNums.has(j)) return false;
      usedNums.add(j);
      qty = n;
      const u = tokens[j + 1];
      if (u && (GRAM.test(u) || ML.test(u))) scale = 0.001;
      return true;
    };
    for (let j = h.at - 1; j >= leftStop && tokens[j] !== ","; j--) if (take(j)) break;
    if (qty === null) {
      const rightStop = idx < hits.length - 1 ? hits[idx + 1].at : tokens.length;
      for (let j = h.at + h.len; j < rightStop && tokens[j] !== ","; j++) if (take(j)) break;
    }
    return { productId: h.product.id, name: h.product.name, qty: (qty ?? 1) * scale, unit: h.product.unit, price: null };
  });

  // Customer: any known name or alias in the text.
  let customer: Customer | undefined;
  for (const t of tokens) {
    if (t.length < 3) continue;
    customer = findCustomer(customers, t);
    if (customer) break;
  }

  const numbers = tokens.map(readNumber).filter((n): n is number => n !== null);
  let intent: Intent = items.length ? "sale" : "unknown";
  if (RESTOCK.test(lower) && items.length) intent = "restock";
  else if (!items.length && PAID.test(lower) && numbers.length) intent = "payment";
  else if (!items.length && /(stock|സ്റ്റോക്ക്|theernnu|തീർന്നു)/i.test(lower)) intent = "stock_query";
  else if (!items.length && CREDIT.test(lower)) intent = "credit_query";
  else if (!items.length && /(today|innu|ഇന്ന്|summary|kanakku|കണക്ക്)/i.test(lower)) intent = "summary";

  const paymentMode: PaymentMode = CREDIT.test(lower) ? "credit" : UPI.test(lower) ? "upi" : "cash";

  return {
    intent,
    transcript: text,
    customerName: customer?.name ?? null,
    paymentMode,
    items: intent === "sale" || intent === "restock" ? items : [],
    amount: intent === "payment" ? Math.max(...numbers) : null,
    confidence: items.length ? 0.6 : 0.3,
    engine: "offline",
  };
}
