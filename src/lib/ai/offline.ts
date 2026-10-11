// Rule-based parser used when there is no internet or no Gemini key.
// Handles typed Malayalam, Manglish and English like:
//   "2 kilo ari, oru soap rajan pattu"
//   "രണ്ട് കിലോ പഞ്ചസാര രാജന് പറ്റ്"
//   "Rajan paid 500"
import { findCustomer } from "../kanakku";
import type { Customer, Intent, Lang, ParsedItem, ParsedMessage, PaymentMode, Product } from "../types";

const NUM_WORDS: Record<string, number> = {
  // English
  half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, dozen: 12, fifteen: 15, twenty: 20,
  // Manglish
  ara: 0.5, oru: 1, onnu: 1, randu: 2, rand: 2, moonu: 3, munnu: 3, naalu: 4, nalu: 4, anju: 5, aaru: 6, ezhu: 7,
  ettu: 8, ombathu: 9, pathu: 10,
  // Hindi (shop helpers)
  aadha: 0.5, adha: 0.5, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, darjan: 12,
  "आधा": 0.5, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "दर्जन": 12,
  // Malayalam
  "അര": 0.5, "കാൽ": 0.25, "ഒരു": 1, "ഒന്ന്": 1, "രണ്ട്": 2, "രണ്ടു": 2, "മൂന്ന്": 3, "നാല്": 4, "അഞ്ച്": 5, "ആറ്": 6,
  "ഏഴ്": 7, "എട്ട്": 8, "ഒമ്പത്": 9, "പത്ത്": 10, "ഡസൻ": 12,
};

const GRAM = /^(g|gm|gms|gram|grams|ഗ്രാം|ग्राम)$/;
const ML = /^(ml|മില്ലി)$/;
// Roman words need word edges ("aya" sits inside "cherupayar"); Malayalam and Hindi script don't.
const words = (roman: string, script = "") => new RegExp(`(?<![a-z])(${roman})(?![a-z])${script ? `|${script}` : ""}`, "i");
const CREDIT = words("pattu|pattil|credit|kadam|ezhuthiko|ezhuthikko|udhaar|udhar|udhari|khata", "പറ്റ്|പറ്റിൽ|കടം|എഴുതിക്കോ|खाता|उधार");
const UPI = words("upi|gpay|g pay|google pay|phonepe|paytm", "ജിപേ");
const PAID = words("paid|thannu|adachu|payment|kodutthu|diya|diye|de diya|jama", "തന്നു|അടച്ചു|കൊടുത്തു|दिया|दिए|जमा");
const RESTOCK = words("vannu|arrived|stock in|stock vannu|delivery|irakki|aaya|aya|aa gaya|aagaya", "വന്നു|ഇറക്കി|आया|आ गया");
const STOCK_Q = words("stock|theernnu|low|running out|finished|maal", "സ്റ്റോക്ക്|തീർന്നു|തീരാറായി|स्टॉक");
const CREDIT_Q = words("owes?|dues?|pending|baaki|bakki", "ബാക്കി|बाकी");
const SUMMARY = words("today|innu|summary|kanakku|aaj|hisab|hisaab", "ഇന്ന്|കണക്ക്|आज|हिसाब");
const QUESTION = /\?|(?<![a-z])(etra|ethra|which|what|how|why|best|profit|laabham|labham|kitna|kaun)(?![a-z])|ലാഭം|എത്ര|ഏത്|कितना|कौन/i;

const tokenize = (s: string) =>
  s.toLowerCase().normalize("NFC").replace(/[,.;!?।]/g, " , ").replace(/(\d)([a-zഀ-ൿऀ-ॿ])/g, "$1 $2").split(/\s+/).filter(Boolean);

// Roman-letter Hindi that a Malayali shopkeeper wouldn't type.
const HINDI_WORDS = /\b(udhaar|udhar|khata|diya|jama|aaya|aa gaya|chawal|cheeni|chini|doodh|anda|ande|sabun|namak|haldi|aata|pyaz|pyaaz|machis|kilo do|ek kilo|do kilo|teen|paanch|wala|wale|ko|hai)\b/i;

function detectLang(text: string): Lang {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (HINDI_WORDS.test(text)) return "hi";
  return "ml"; // Manglish and English replies look the same
}

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
        if (t === w || t === `${w}s` || t === `${w}es`) return true; // eggs, biscuits
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
  else if (!items.length && QUESTION.test(lower) && !STOCK_Q.test(lower) && !CREDIT_Q.test(lower)) intent = "question";
  else if (!items.length && STOCK_Q.test(lower)) intent = "stock_query";
  else if (!items.length && (CREDIT.test(lower) || CREDIT_Q.test(lower))) intent = "credit_query";
  else if (!items.length && SUMMARY.test(lower)) intent = "summary";

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
    lang: detectLang(text),
  };
}
