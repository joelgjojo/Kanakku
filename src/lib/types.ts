export type Unit = "kg" | "l" | "pc" | "pkt";

export interface Product {
  id: string;
  name: string; // English name
  nameMl: string; // Malayalam name
  aliases: string[]; // extra spellings: manglish, brand names, etc.
  unit: Unit;
  price: number; // selling price per unit (₹)
  stock: number; // current stock in `unit`
  lowStockAt: number; // alert threshold
  category: string;
}

export interface Customer {
  id: string;
  name: string;
  nameMl?: string;
  aliases: string[];
  phone?: string;
  createdAt: string;
}

export type PaymentMode = "cash" | "upi" | "credit";
export type Source = "voice" | "whatsapp" | "notebook" | "manual" | "text";

export interface BillItem {
  productId: string | null;
  name: string;
  nameMl?: string;
  qty: number;
  unit: Unit;
  price: number; // per unit
  total: number;
}

export interface Bill {
  id: string;
  number: number;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  items: BillItem[];
  total: number;
  paymentMode: PaymentMode;
  source: Source;
  rawInput?: string;
}

export interface Payment {
  id: string;
  createdAt: string;
  customerId: string;
  amount: number;
  note?: string;
  source: Source;
}

export interface StockMove {
  id: string;
  createdAt: string;
  productId: string;
  qty: number; // positive = stock in, negative = correction
  reason: "restock" | "audit" | "manual";
  source: Source;
}

// ---- AI parse results ----

export type Intent =
  | "sale"
  | "payment"
  | "restock"
  | "stock_query"
  | "credit_query"
  | "summary"
  | "unknown";

export interface ParsedItem {
  productId: string | null;
  name: string;
  qty: number;
  unit: Unit;
  price: number | null;
}

export interface ParsedMessage {
  intent: Intent;
  transcript: string;
  customerName: string | null;
  paymentMode: PaymentMode;
  items: ParsedItem[];
  amount: number | null; // for payment intent
  confidence: number;
  engine: "gemini" | "offline";
}

export interface NotebookEntry {
  kind: "sale" | "payment";
  date: string | null; // ISO date if readable
  customerName: string | null;
  isCredit: boolean;
  items: ParsedItem[];
  amount: number; // total for sale, amount for payment
  lineText: string; // what was written on the page
  confidence: number;
}

export interface NotebookResult {
  rawText: string;
  entries: NotebookEntry[];
}

export interface ShelfCount {
  productId: string | null;
  name: string;
  counted: number;
  unit: Unit;
  confidence: number;
}

export interface ShelfResult {
  items: ShelfCount[];
  notes: string;
}
