import { askJSON, hasGemini, type Media } from "./gemini";
import { offlineParse } from "./offline";
import type { Customer, NotebookResult, ParsedMessage, Product, ShelfResult } from "../types";

const catalogue = (products: Product[]) =>
  products.map((p) => `${p.id} | ${p.name} | ${p.nameMl} | ${p.aliases.join(", ")} | per ${p.unit} | ₹${p.price}`).join("\n");

const people = (customers: Customer[]) =>
  customers.map((c) => [c.name, c.nameMl, ...c.aliases].filter(Boolean).join(" / ")).join("\n");

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    productId: { type: ["string", "null"], description: "id from the catalogue, or null if the item is not in it" },
    name: { type: "string", description: "English product name" },
    qty: { type: "number", description: "quantity in the catalogue unit (500 g of a per-kg item = 0.5)" },
    unit: { type: "string", enum: ["kg", "l", "pc", "pkt"] },
    price: { type: ["number", "null"], description: "per-unit price only if the speaker said a different price, else null" },
  },
  required: ["productId", "name", "qty", "unit", "price"],
};

const MESSAGE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["sale", "payment", "restock", "stock_query", "credit_query", "summary", "unknown"] },
    transcript: { type: "string", description: "exact words spoken or typed, in the original script" },
    customerName: { type: ["string", "null"] },
    paymentMode: { type: "string", enum: ["cash", "upi", "credit"] },
    items: { type: "array", items: ITEM_SCHEMA },
    amount: { type: ["number", "null"], description: "rupees paid, for payment intent" },
    confidence: { type: "number", description: "0 to 1" },
  },
  required: ["intent", "transcript", "customerName", "paymentMode", "items", "amount", "confidence"],
};

const RULES = `You are the billing assistant inside a small Kerala grocery shop (kada).
The shopkeeper speaks or types in Malayalam, Manglish (Malayalam in English letters) or English, often mixed.

Decide the intent:
- sale: they are billing items to a customer. "രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്" = sale of 2 kg sugar to Rajan on credit.
- payment: a customer paid back credit. "രാജൻ 500 തന്നു" / "Suma paid 300".
- restock: stock arrived from a supplier. "50 കിലോ അരി വന്നു" / "25 kg rice delivery".
- stock_query: asking what is low or what stock is left.
- credit_query: asking who owes money / pattu list.
- summary: asking for today's sales / kanakku.
- unknown: anything else.

Rules:
- Map every item to the closest product in the catalogue below and use its id and unit. Match Malayalam, Manglish and brand names (e.g. "Milma" = milk, "Lux" = soap).
- Convert quantities to the catalogue unit: 500 ഗ്രാം of a per-kg item = 0.5; "അര കിലോ" = 0.5; "കാൽ കിലോ" = 0.25; "ഒരു ഡസൻ മുട്ട" = 12.
- No quantity said = 1.
- paymentMode is "credit" when they say പറ്റ് / pattu / പറ്റിൽ എഴുതിക്കോ / കടം / credit; "upi" for GPay / UPI / PhonePe; otherwise "cash".
- customerName: match to a known customer below when possible and return their English name; otherwise return the name as heard. Remove Malayalam case endings (രാജന് → Rajan).
- price is null unless the shopkeeper said a different price for that item.
- If an item is not in the catalogue, keep it with productId null and your best guess for unit.`;

export async function parseMessage(
  input: { text?: string; audio?: Media },
  products: Product[],
  customers: Customer[],
): Promise<ParsedMessage> {
  if (!hasGemini()) {
    if (!input.text) throw new Error("Voice needs a Gemini API key. Type the bill instead, or add GEMINI_API_KEY.");
    return offlineParse(input.text, products, customers);
  }
  const prompt = `${RULES}

CATALOGUE (id | name | Malayalam | other names | unit | price):
${catalogue(products)}

KNOWN CUSTOMERS:
${people(customers)}

${input.audio ? "The shopkeeper's voice note is attached. Transcribe it exactly, then parse it." : `Message: """${input.text}"""`}`;
  try {
    const out = await askJSON<Omit<ParsedMessage, "engine">>(prompt, MESSAGE_SCHEMA, input.audio);
    return { ...out, items: out.items ?? [], engine: "gemini" };
  } catch (e) {
    // Network or quota trouble: typed text can still be billed offline.
    if (input.text) return offlineParse(input.text, products, customers);
    throw e;
  }
}

const NOTEBOOK_SCHEMA = {
  type: "object",
  properties: {
    rawText: { type: "string", description: "everything written on the page, line by line, in the original script" },
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["sale", "payment"] },
          date: { type: ["string", "null"], description: "YYYY-MM-DD if a date applies to this line" },
          customerName: { type: ["string", "null"] },
          isCredit: { type: "boolean" },
          items: { type: "array", items: ITEM_SCHEMA },
          amount: { type: "number", description: "line total in rupees (sale) or rupees received (payment)" },
          lineText: { type: "string", description: "the line exactly as written" },
          confidence: { type: "number" },
        },
        required: ["kind", "date", "customerName", "isCredit", "items", "amount", "lineText", "confidence"],
      },
    },
  },
  required: ["rawText", "entries"],
};

export async function readNotebook(image: Media, products: Product[], customers: Customer[]): Promise<NotebookResult> {
  if (!hasGemini()) throw new Error("Reading notebook photos needs GEMINI_API_KEY in .env.local");
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `${RULES}

The attached photo is a page from the shop's handwritten notebook: a sales book or a credit (പറ്റ്) book.
Handwriting may be Malayalam, English or mixed, with abbreviations, crossed-out lines and running totals.
Today is ${today}. If the page has a date heading, apply it to the lines below it. Dates in Kerala are written DD/MM.

Read every line and turn each into one entry:
- A line selling items (with or without a customer) is a "sale". If it is in a credit book or has a customer name with no payment mark, isCredit = true.
- A line where a customer paid money (വരവ്, paid, crossed out with amount, "കിട്ടി") is a "payment" with amount and no items.
- amount must be the rupee total written on that line; if not written, compute it from the catalogue prices.
- Skip page totals, headings and fully struck-out lines.
- Lower confidence for lines that are hard to read.

CATALOGUE (id | name | Malayalam | other names | unit | price):
${catalogue(products)}

KNOWN CUSTOMERS:
${people(customers)}`;
  return askJSON<NotebookResult>(prompt, NOTEBOOK_SCHEMA, image);
}

const SHELF_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: ["string", "null"] },
          name: { type: "string" },
          counted: { type: "number", description: "estimated quantity visible, in the catalogue unit" },
          unit: { type: "string", enum: ["kg", "l", "pc", "pkt"] },
          confidence: { type: "number" },
        },
        required: ["productId", "name", "counted", "unit", "confidence"],
      },
    },
    notes: { type: "string", description: "one or two short sentences about what you could and could not count" },
  },
  required: ["items", "notes"],
};

export async function auditShelf(image: Media, products: Product[]): Promise<ShelfResult> {
  if (!hasGemini()) throw new Error("Shelf audit needs GEMINI_API_KEY in .env.local");
  const prompt = `You are checking stock on a small Kerala grocery shop shelf from a photo.
Count the visible units of each product from the catalogue. Packets and bottles: count each one. Loose items in sacks or jars: estimate weight in kg from how full they look (a full standard rice sack is about 25 kg) and lower your confidence.
Only report products you can actually see. Map each to the catalogue id when you can.

CATALOGUE (id | name | Malayalam | other names | unit | price):
${catalogue(products)}`;
  return askJSON<ShelfResult>(prompt, SHELF_SCHEMA, image);
}
