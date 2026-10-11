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

export async function createBill(input: NewBill): Promise<Bill> {
  const store = getStore();
  let customer: Customer | null = null;
  if (input.customerId) customer = (await store.listCustomers()).find((c) => c.id === input.customerId) ?? null;
  if (!customer) customer = await resolveCustomer(input.customerName);
  if (input.paymentMode === "credit" && !customer) throw new Error("Pattu needs a customer name");

  const items = input.items.map((i) => ({ ...i, total: round2(i.qty * i.price) }));
  const bill = await store.insertBill({
    id: uid("b"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    items,
    total: round2(items.reduce((s, i) => s + i.total, 0)),
    paymentMode: input.paymentMode,
    source: input.source,
    rawInput: input.rawInput,
  });
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

export interface Balance {
  customer: Customer;
  credit: number;
  paid: number;
  due: number;
  lastActivity: string | null;
  lastPayment: string | null;
  oldestUnpaidDays: number;
}

export async function balances(): Promise<Balance[]> {
  const store = getStore();
  const [customers, bills, payments] = await Promise.all([store.listCustomers(), store.listBills(), store.listPayments()]);
  return customers
    .map((customer) => {
      const cb = bills.filter((b) => b.customerId === customer.id && b.paymentMode === "credit");
      const cp = payments.filter((p) => p.customerId === customer.id);
      const credit = cb.reduce((s, b) => s + b.total, 0);
      const paid = cp.reduce((s, p) => s + p.amount, 0);
      const dates = [...cb.map((b) => b.createdAt), ...cp.map((p) => p.createdAt)].sort();
      const lastPayment = cp.map((p) => p.createdAt).sort().at(-1) ?? null;
      // Walk credits oldest-first, paying them off, to find the oldest bill still unpaid.
      let left = paid;
      let oldest: string | null = null;
      for (const b of [...cb].sort((a, c) => a.createdAt.localeCompare(c.createdAt))) {
        if (left >= b.total) left -= b.total;
        else { oldest = b.createdAt; break; }
      }
      return {
        customer,
        credit: round2(credit),
        paid: round2(paid),
        due: round2(credit - paid),
        lastActivity: dates.at(-1) ?? null,
        lastPayment,
        oldestUnpaidDays: oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000) : 0,
      };
    })
    .sort((a, b) => b.due - a.due);
}

export async function customerDue(customerId: string) {
  return (await balances()).find((b) => b.customer.id === customerId)?.due ?? 0;
}
