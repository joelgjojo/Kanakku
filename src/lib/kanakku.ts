// Core shop operations shared by the web app, the WhatsApp bot and the notebook importer.
import { getStore } from "./store";
import { uid } from "./format";
import type { Bill, BillItem, Customer, ParsedItem, PaymentMode, Product, Source } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const round2 = (n: number) => Math.round(n * 100) / 100;

export function findProduct(products: Product[], name: string): Product | undefined {
  const n = norm(name);
  if (!n) return;
  const names = (p: Product) => [p.name, p.nameMl, ...p.aliases].map(norm);
  return (
    products.find((p) => names(p).includes(n)) ??
    products.find((p) => names(p).some((x) => x.length > 2 && (n.includes(x) || x.includes(n))))
  );
}

export function findCustomer(customers: Customer[], name: string): Customer | undefined {
  const n = norm(name);
  if (!n) return;
  const names = (c: Customer) => [c.name, c.nameMl ?? "", ...c.aliases].map(norm).filter(Boolean);
  return (
    customers.find((c) => names(c).includes(n)) ??
    customers.find((c) => names(c).some((x) => n.startsWith(x) || x.startsWith(n)))
  );
}

export async function resolveCustomer(name: string | null | undefined): Promise<Customer | null> {
  if (!name?.trim()) return null;
  const store = getStore();
  const existing = findCustomer(await store.listCustomers(), name);
  if (existing) return existing;
  const isMl = /[ഀ-ൿ]/.test(name);
  return store.upsertCustomer({
    id: uid("c"),
    name: name.trim(),
    nameMl: isMl ? name.trim() : undefined,
    aliases: [],
    createdAt: new Date().toISOString(),
  });
}

/** Turn parsed items into priced bill lines using the catalogue. */
export function toBillItems(items: ParsedItem[], products: Product[]): BillItem[] {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const p = (i.productId && products.find((x) => x.id === i.productId)) || findProduct(products, i.name);
      const price = i.price ?? p?.price ?? 0;
      return {
        productId: p?.id ?? null,
        name: p?.name ?? i.name,
        nameMl: p?.nameMl,
        qty: i.qty,
        unit: p?.unit ?? i.unit,
        price,
        total: round2(price * i.qty),
      };
    });
}

export interface NewBill {
  /** Made by the phone before sending, so a bill retried after a dropped connection is saved only once. */
  id?: string;
  items: BillItem[];
  customerName?: string | null;
  customerId?: string | null;
  paymentMode: PaymentMode;
  source: Source;
  rawInput?: string;
  createdAt?: string;
  /** Older notebook entries should not reduce today's stock. */
  affectStock?: boolean;
}

const CLIENT_ID = /^b-[A-Za-z0-9_-]{8,64}$/;

export async function createBill(input: NewBill): Promise<Bill> {
  const store = getStore();
  const clientId = input.id && CLIENT_ID.test(input.id) ? input.id : null;
  if (clientId) {
    const existing = await store.getBill(clientId);
    if (existing) return existing; // already saved: a retry, not a new sale
  }
  let customer: Customer | null = null;
  if (input.customerId) customer = (await store.listCustomers()).find((c) => c.id === input.customerId) ?? null;
  if (!customer) customer = await resolveCustomer(input.customerName);
  if (input.paymentMode === "credit" && !customer) throw new Error("Pattu needs a customer name");

  const items = input.items.map((i) => ({ ...i, total: round2(i.qty * i.price) }));
  let bill: Bill;
  try {
    bill = await store.insertBill({
      id: clientId ?? uid("b"),
      createdAt: input.createdAt ?? new Date().toISOString(),
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      items,
      total: round2(items.reduce((s, i) => s + i.total, 0)),
      paymentMode: input.paymentMode,
      source: input.source,
      rawInput: input.rawInput,
    });
  } catch (e) {
    // Two copies of the same retried bill arrived together: the first one won.
    const existing = clientId ? await store.getBill(clientId) : null;
    if (existing) return existing;
    throw e;
  }
  if (input.affectStock !== false) {
    for (const i of items) if (i.productId) await store.adjustStock(i.productId, -i.qty);
  }
  return bill;
}

export async function recordPayment(customerName: string | null, amount: number, source: Source, customerId?: string) {
  const store = getStore();
  const customer = customerId
    ? (await store.listCustomers()).find((c) => c.id === customerId) ?? null
    : await resolveCustomer(customerName);
  if (!customer) throw new Error("Who paid? Say the customer's name.");
  if (!(amount > 0)) throw new Error("Payment amount must be more than zero");
  return {
    customer,
    payment: await store.insertPayment({
      id: uid("pay"),
      createdAt: new Date().toISOString(),
      customerId: customer.id,
      amount: round2(amount),
      source,
    }),
  };
}

export async function restock(items: ParsedItem[], source: Source) {
  const store = getStore();
  const products = await store.listProducts();
  const done: { product: Product; qty: number }[] = [];
  for (const i of items) {
    const p = (i.productId && products.find((x) => x.id === i.productId)) || findProduct(products, i.name);
    if (!p || !(i.qty > 0)) continue;
    await store.adjustStock(p.id, i.qty);
    await store.insertStockMove({ id: uid("sm"), createdAt: new Date().toISOString(), productId: p.id, qty: i.qty, reason: "restock", source });
    done.push({ product: { ...p, stock: p.stock + i.qty }, qty: i.qty });
  }
  return done;
}

export interface Trust {
  score: number; // 0–100
  label: "Reliable" | "Watch" | "Risky" | "New";
  avgDaysToPay: number | null; // how long they usually take to clear a pattu bill
  limit: number; // suggested pattu limit (₹)
  reason: string; // one line a shopkeeper understands
}

export interface Balance {
  customer: Customer;
  credit: number;
  paid: number;
  due: number;
  lastActivity: string | null;
  lastPayment: string | null;
  oldestUnpaidDays: number;
  trust: Trust;
}

const DAY = 86400000;

/**
 * Trust score from the customer's own history. Payments clear the oldest pattu first,
 * so we know how many days each bill took to be paid off.
 */
function trustOf(credits: { at: number; amount: number }[], pays: { at: number; amount: number }[], due: number, oldestUnpaidDays: number): Trust {
  const queue = credits.map((c) => ({ ...c, left: c.amount }));
  const cleared: { days: number; amount: number }[] = [];
  let qi = 0;
  for (const p of pays) {
    let money = p.amount;
    while (money > 0.009 && qi < queue.length) {
      const c = queue[qi];
      const take = Math.min(money, c.left);
      c.left -= take;
      money -= take;
      if (c.left <= 0.009) {
        cleared.push({ days: Math.max(0, (p.at - c.at) / DAY), amount: c.amount });
        qi++;
      }
    }
  }
  const monthCredit = credits.filter((c) => Date.now() - c.at < 30 * DAY).reduce((s, c) => s + c.amount, 0);
  const totalCleared = cleared.reduce((s, c) => s + c.amount, 0);
  const avgDaysToPay = totalCleared ? cleared.reduce((s, c) => s + c.days * c.amount, 0) / totalCleared : null;

  if (credits.length < 3 && !pays.length) {
    return { score: 60, label: "New", avgDaysToPay: null, limit: 1000, reason: "New on pattu. Start with a small limit." };
  }
  let score = 100;
  if (avgDaysToPay !== null) score -= Math.min(40, Math.max(0, (avgDaysToPay - 5) * 2.5));
  else score -= 40; // has pattu but has never paid anything back
  score -= Math.min(35, Math.max(0, (oldestUnpaidDays - 10) * 2));
  if (monthCredit > 0 && due > monthCredit * 2) score -= 10; // balance keeps growing
  score = Math.round(Math.max(5, Math.min(100, score)));

  const label: Trust["label"] = score >= 75 ? "Reliable" : score >= 50 ? "Watch" : "Risky";
  const base = Math.max(1000, monthCredit * 0.6);
  const limit = Math.max(500, Math.ceil((base * (0.4 + score / 100)) / 250) * 250);
  const reason =
    avgDaysToPay === null
      ? "Has taken pattu but hasn't paid any back yet."
      : `Usually pays in ${Math.max(1, Math.round(avgDaysToPay))} day${Math.round(avgDaysToPay) > 1 ? "s" : ""}` +
        (oldestUnpaidDays > 14 ? `, but has a bill unpaid for ${oldestUnpaidDays} days.` : ".");
  return { score, label, avgDaysToPay: avgDaysToPay === null ? null : Math.round(avgDaysToPay * 10) / 10, limit, reason };
}

export async function balances(): Promise<Balance[]> {
  const store = getStore();
  const [customers, bills, payments] = await Promise.all([store.listCustomers(), store.listBills(), store.listPayments()]);
  return customers
    .map((customer) => {
      const cb = bills.filter((b) => b.customerId === customer.id && b.paymentMode === "credit").sort((a, c) => a.createdAt.localeCompare(c.createdAt));
      const cp = payments.filter((p) => p.customerId === customer.id).sort((a, c) => a.createdAt.localeCompare(c.createdAt));
      const credit = cb.reduce((s, b) => s + b.total, 0);
      const paid = cp.reduce((s, p) => s + p.amount, 0);
      const dates = [...cb.map((b) => b.createdAt), ...cp.map((p) => p.createdAt)].sort();
      const lastPayment = cp.at(-1)?.createdAt ?? null;
      // Walk credits oldest-first, paying them off, to find the oldest bill still unpaid.
      let left = paid;
      let oldest: string | null = null;
      for (const b of cb) {
        if (left >= b.total) left -= b.total;
        else { oldest = b.createdAt; break; }
      }
      const oldestUnpaidDays = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / DAY) : 0;
      const due = round2(credit - paid);
      return {
        customer,
        credit: round2(credit),
        paid: round2(paid),
        due,
        lastActivity: dates.at(-1) ?? null,
        lastPayment,
        oldestUnpaidDays,
        trust: trustOf(
          cb.map((b) => ({ at: new Date(b.createdAt).getTime(), amount: b.total })),
          cp.map((p) => ({ at: new Date(p.createdAt).getTime(), amount: p.amount })),
          due,
          oldestUnpaidDays,
        ),
      };
    })
    .sort((a, b) => b.due - a.due);
}

export async function customerDue(customerId: string) {
  return (await balances()).find((b) => b.customer.id === customerId)?.due ?? 0;
}

export interface LedgerEntry {
  id: string;
  at: string;
  kind: "credit" | "payment";
  amount: number;
  source: Source;
  text: string;
}

/** One customer's pattu page: balance, trust and every credit bill and payment, oldest first. */
export async function customerLedger(customerId: string) {
  const store = getStore();
  const bal = (await balances()).find((b) => b.customer.id === customerId);
  if (!bal) return null;
  const [bills, payments] = await Promise.all([store.listBills(), store.listPayments()]);
  const entries: LedgerEntry[] = [
    ...bills
      .filter((b) => b.customerId === customerId && b.paymentMode === "credit")
      .map((b) => ({
        id: b.id,
        at: b.createdAt,
        kind: "credit" as const,
        amount: b.total,
        source: b.source,
        text: b.items.map((i) => `${i.nameMl ?? i.name} ${i.qty}${i.unit === "pc" ? "" : " " + i.unit}`).join(", "),
      })),
    ...payments
      .filter((p) => p.customerId === customerId)
      .map((p) => ({ id: p.id, at: p.createdAt, kind: "payment" as const, amount: p.amount, source: p.source, text: p.note ?? "Paid" })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return { ...bal, entries };
}

export interface PurchaseOutcome {
  product: Product;
  qty: number;
  unitCost: number;
  isNew: boolean;
  oldCost: number | null;
  marginPct: number;
}

/**
 * Stock arrived on a supplier bill: add the stock, remember what we paid (for profit),
 * and create any item the shop didn't stock before (priced at cost + 15%).
 */
export async function importPurchase(
  lines: { productId: string | null; name: string; nameMl?: string | null; qty: number; unit: Product["unit"]; unitCost: number }[],
  source: Source,
): Promise<PurchaseOutcome[]> {
  const store = getStore();
  const products = await store.listProducts();
  const out: PurchaseOutcome[] = [];
  for (const l of lines) {
    if (!(l.qty > 0) || !(l.unitCost > 0)) continue;
    let p = (l.productId && products.find((x) => x.id === l.productId)) || findProduct(products, l.name) || null;
    const unitCost = Math.round(l.unitCost * 100) / 100;
    if (!p) {
      const created: Product = {
        id: uid("p"),
        name: l.name.trim(),
        nameMl: l.nameMl?.trim() || "",
        aliases: [],
        unit: l.unit,
        price: Math.ceil(unitCost * 1.15),
        costPrice: unitCost,
        stock: 0,
        lowStockAt: Math.max(1, Math.round(l.qty / 4)),
        category: "New",
      };
      await store.upsertProduct(created);
      products.push(created);
      p = created;
      out.push({ product: { ...created, stock: l.qty }, qty: l.qty, unitCost, isNew: true, oldCost: null, marginPct: Math.round(((created.price - unitCost) / created.price) * 1000) / 10 });
    } else {
      const oldCost = p.costPrice ?? null;
      p = { ...p, costPrice: unitCost };
      await store.upsertProduct(p);
      out.push({ product: { ...p, stock: p.stock + l.qty }, qty: l.qty, unitCost, isNew: false, oldCost, marginPct: Math.round(((p.price - unitCost) / p.price) * 1000) / 10 });
    }
    await store.adjustStock(p.id, l.qty);
    await store.insertStockMove({ id: uid("sm"), createdAt: new Date().toISOString(), productId: p.id, qty: l.qty, reason: "restock", source });
  }
  return out;
}
