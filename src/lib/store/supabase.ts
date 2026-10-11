import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSeed } from "../seed";
import type { Bill, Customer, Payment, Product, StockMove } from "../types";
import type { Store } from "./index";

// Cloud store. Tables are created by supabase/schema.sql.
// Column names are snake_case in Postgres and camelCase in the app.

type Row = Record<string, unknown>;

const toProduct = (r: Row): Product => ({
  id: r.id as string,
  name: r.name as string,
  nameMl: r.name_ml as string,
  aliases: (r.aliases as string[]) ?? [],
  unit: r.unit as Product["unit"],
  price: Number(r.price),
  stock: Number(r.stock),
  lowStockAt: Number(r.low_stock_at),
  category: r.category as string,
});
const fromProduct = (p: Product): Row => ({
  id: p.id, name: p.name, name_ml: p.nameMl, aliases: p.aliases, unit: p.unit,
  price: p.price, stock: p.stock, low_stock_at: p.lowStockAt, category: p.category,
});

const toCustomer = (r: Row): Customer => ({
  id: r.id as string,
  name: r.name as string,
  nameMl: (r.name_ml as string) ?? undefined,
  aliases: (r.aliases as string[]) ?? [],
  phone: (r.phone as string) ?? undefined,
  createdAt: r.created_at as string,
});
const fromCustomer = (c: Customer): Row => ({
  id: c.id, name: c.name, name_ml: c.nameMl ?? null, aliases: c.aliases, phone: c.phone ?? null, created_at: c.createdAt,
});

const toBill = (r: Row): Bill => ({
  id: r.id as string,
  number: Number(r.number),
  createdAt: r.created_at as string,
  customerId: (r.customer_id as string) ?? null,
  customerName: (r.customer_name as string) ?? null,
  items: r.items as Bill["items"],
  total: Number(r.total),
  paymentMode: r.payment_mode as Bill["paymentMode"],
  source: r.source as Bill["source"],
  rawInput: (r.raw_input as string) ?? undefined,
});
// `number` is assigned by Postgres (identity column), in insert order.
const fromBill = (b: Omit<Bill, "number">): Row => ({
  id: b.id, created_at: b.createdAt, customer_id: b.customerId,
  customer_name: b.customerName, items: b.items, total: b.total, payment_mode: b.paymentMode,
  source: b.source, raw_input: b.rawInput ?? null,
});

const toPayment = (r: Row): Payment => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  customerId: r.customer_id as string,
  amount: Number(r.amount),
  note: (r.note as string) ?? undefined,
  source: r.source as Payment["source"],
});
const fromPayment = (p: Payment): Row => ({
  id: p.id, created_at: p.createdAt, customer_id: p.customerId, amount: p.amount, note: p.note ?? null, source: p.source,
});

const toMove = (r: Row): StockMove => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  productId: r.product_id as string,
  qty: Number(r.qty),
  reason: r.reason as StockMove["reason"],
  source: r.source as StockMove["source"],
});

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

export class SupabaseStore implements Store {
  kind = "supabase" as const;
  private db: SupabaseClient;
  private seeded: Promise<void> | null = null;

  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false } });
  }

  // First request on an empty database loads the demo shop.
  private ensureSeeded() {
    this.seeded ??= (async () => {
      const { count } = await this.db.from("products").select("id", { count: "exact", head: true });
      if (!count) await this.seed();
    })();
    return this.seeded;
  }

  private async seed() {
    const s = buildSeed();
    must(await this.db.from("products").upsert(s.products.map(fromProduct)));
    must(await this.db.from("customers").upsert(s.customers.map(fromCustomer)));
    for (let i = 0; i < s.bills.length; i += 200) {
      must(await this.db.from("bills").upsert(s.bills.slice(i, i + 200).map((b) => fromBill(b))));
    }
    must(await this.db.from("payments").upsert(s.payments.map(fromPayment)));
  }

  async listProducts() {
    await this.ensureSeeded();
    return must(await this.db.from("products").select("*").order("category").order("name")).map(toProduct);
  }
  async upsertProduct(p: Product) {
    must(await this.db.from("products").upsert(fromProduct(p)));
    return p;
  }
  async adjustStock(productId: string, delta: number) {
    // Atomic increment via the SQL function in schema.sql.
    must(await this.db.rpc("adjust_stock", { pid: productId, delta }));
  }

  async listCustomers() {
    await this.ensureSeeded();
    return must(await this.db.from("customers").select("*").order("name")).map(toCustomer);
  }
  async upsertCustomer(c: Customer) {
    must(await this.db.from("customers").upsert(fromCustomer(c)));
    return c;
  }

  async listBills(sinceDays?: number) {
    await this.ensureSeeded();
    let q = this.db.from("bills").select("*").order("created_at");
    if (sinceDays) q = q.gte("created_at", new Date(Date.now() - sinceDays * 86400000).toISOString());
    return must(await q.limit(5000)).map(toBill);
  }
  async insertBill(b: Omit<Bill, "number">) {
    const row = must(await this.db.from("bills").insert(fromBill(b)).select().single());
    return toBill(row as unknown as Row);
  }

  async listPayments() {
    await this.ensureSeeded();
    return must(await this.db.from("payments").select("*").order("created_at")).map(toPayment);
  }
  async insertPayment(p: Payment) {
    must(await this.db.from("payments").insert(fromPayment(p)));
    return p;
  }

  async listStockMoves() {
    return must(await this.db.from("stock_moves").select("*").order("created_at")).map(toMove);
  }
  async insertStockMove(m: StockMove) {
    must(await this.db.from("stock_moves").insert({
      id: m.id, created_at: m.createdAt, product_id: m.productId, qty: m.qty, reason: m.reason, source: m.source,
    }));
    return m;
  }

  async reset() {
    for (const t of ["stock_moves", "payments", "bills", "customers", "products"]) {
      must(await this.db.from(t).delete().neq("id", "__none__"));
    }
    await this.seed();
    this.seeded = Promise.resolve();
  }
}
