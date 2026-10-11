import { getStore } from "./store";
import { balances } from "./kanakku";
import { startOfDay } from "./format";
import type { Bill, Product, Source } from "./types";

export interface Forecast {
  product: Product;
  perDay: number; // weighted average units sold per day
  daysLeft: number | null; // null = not selling
  reorderQty: number; // enough for a week, rounded to sensible packs
  status: "out" | "critical" | "low" | "ok" | "dead";
  margin: number | null; // % profit on the selling price, if we know the cost
}

/** Profit on one bill line, using the product's latest cost price. Null if cost unknown. */
export function lineProfit(item: { productId: string | null; qty: number; price: number }, byId: Map<string, Product>) {
  const cost = item.productId ? byId.get(item.productId)?.costPrice : undefined;
  if (cost === undefined || cost === null) return null;
  return (item.price - cost) * item.qty;
}

const DAY = 86400000;

/**
 * Weighted moving average over the last 14 days: the most recent week counts
 * twice as much as the week before, so a sudden change shows up quickly.
 */
export function forecast(products: Product[], bills: Bill[], now = Date.now()): Forecast[] {
  const sold = new Map<string, { recent: number; older: number; last: number }>();
  for (const b of bills) {
    const age = (now - new Date(b.createdAt).getTime()) / DAY;
    if (age > 14) continue;
    for (const i of b.items) {
      if (!i.productId) continue;
      const s = sold.get(i.productId) ?? { recent: 0, older: 0, last: 0 };
      if (age <= 7) s.recent += i.qty;
      else s.older += i.qty;
      s.last = Math.max(s.last, new Date(b.createdAt).getTime());
      sold.set(i.productId, s);
    }
  }
  return products
    .map((product) => {
      const s = sold.get(product.id);
      const perDay = s ? (2 * (s.recent / 7) + s.older / 7) / 3 : 0;
      const daysLeft = perDay > 0 ? product.stock / perDay : null;
      const step = product.unit === "pc" ? 10 : product.unit === "kg" ? 5 : 1;
      const reorderQty = Math.max(step, Math.ceil(Math.max(0, perDay * 7 - product.stock) / step) * step);
      const idleDays = s ? (now - s.last) / DAY : Infinity;
      let status: Forecast["status"] = "ok";
      if (product.stock <= 0) status = "out";
      else if (idleDays > 7) status = "dead";
      else if (daysLeft !== null && daysLeft < 2) status = "critical";
      else if ((daysLeft !== null && daysLeft < 4) || product.stock <= product.lowStockAt) status = "low";
      const margin = product.costPrice && product.price ? Math.round(((product.price - product.costPrice) / product.price) * 1000) / 10 : null;
      return { product, perDay: Math.round(perDay * 100) / 100, daysLeft: daysLeft === null ? null : Math.round(daysLeft * 10) / 10, reorderQty, status, margin };
    })
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}

export interface Activity {
  id: string;
  at: string;
  kind: "bill" | "payment" | "restock";
  source: Source;
  title: string;
  amount: number;
  credit: boolean;
  customer: string | null;
}

export async function dashboard() {
  const store = getStore();
  const [products, bills, payments, moves, bal] = await Promise.all([
    store.listProducts(),
    store.listBills(15),
    store.listPayments(),
    store.listStockMoves(),
    balances(),
  ]);
  const today = startOfDay().getTime();
  const todays = bills.filter((b) => new Date(b.createdAt).getTime() >= today);
  const paidToday = payments.filter((p) => new Date(p.createdAt).getTime() >= today);
  const byId = new Map(products.map((p) => [p.id, p]));
  const profitOf = (list: Bill[]) => {
    let profit = 0, covered = 0, sales = 0;
    for (const b of list) for (const i of b.items) {
      sales += i.total;
      const p = lineProfit(i, byId);
      if (p !== null) { profit += p; covered += i.total; }
    }
    return { profit: Math.round(profit), margin: covered ? Math.round((profit / covered) * 1000) / 10 : null, coverage: sales ? covered / sales : 0 };
  };

  // Sales per day for the last 7 days (today included).
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = startOfDay(new Date(Date.now() - (6 - i) * DAY)).getTime();
    const end = start + DAY;
    const inDay = bills.filter((b) => {
      const t = new Date(b.createdAt).getTime();
      return t >= start && t < end;
    });
    return {
      date: new Date(start).toISOString(),
      cash: Math.round(inDay.filter((b) => b.paymentMode !== "credit").reduce((s, b) => s + b.total, 0)),
      credit: Math.round(inDay.filter((b) => b.paymentMode === "credit").reduce((s, b) => s + b.total, 0)),
      profit: profitOf(inDay).profit,
    };
  });

  // Top sellers this week by revenue.
  const weekAgo = Date.now() - 7 * DAY;
  const rev = new Map<string, { name: string; nameMl?: string; revenue: number; qty: number; profit: number }>();
  for (const b of bills) {
    if (new Date(b.createdAt).getTime() < weekAgo) continue;
    for (const i of b.items) {
      const k = i.productId ?? i.name;
      const r = rev.get(k) ?? { name: i.name, nameMl: i.nameMl, revenue: 0, qty: 0, profit: 0 };
      r.revenue += i.total;
      r.qty += i.qty;
      r.profit += lineProfit(i, byId) ?? 0;
      rev.set(k, r);
    }
  }
  const week = bills.filter((b) => new Date(b.createdAt).getTime() >= weekAgo);

  const productName = new Map(products.map((p) => [p.id, p]));
  const activity: Activity[] = [
    ...bills.slice(-40).map((b) => ({
      id: b.id,
      at: b.createdAt,
      kind: "bill" as const,
      source: b.source,
      title: b.items.map((i) => i.nameMl || i.name).join(", "),
      amount: b.total,
      credit: b.paymentMode === "credit",
      customer: b.customerName,
    })),
    ...payments.slice(-15).map((p) => ({
      id: p.id,
      at: p.createdAt,
      kind: "payment" as const,
      source: p.source,
      title: "Pattu payment",
      amount: p.amount,
      credit: false,
      customer: bal.find((x) => x.customer.id === p.customerId)?.customer.name ?? null,
    })),
    ...moves.slice(-10).map((m) => ({
      id: m.id,
      at: m.createdAt,
      kind: "restock" as const,
      source: m.source,
      title: `Stock in: ${productName.get(m.productId)?.name ?? m.productId}`,
      amount: 0,
      credit: false,
      customer: null,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  const fc = forecast(products, bills);
  return {
    storeKind: store.kind,
    today: {
      sales: Math.round(todays.reduce((s, b) => s + b.total, 0)),
      bills: todays.length,
      creditGiven: Math.round(todays.filter((b) => b.paymentMode === "credit").reduce((s, b) => s + b.total, 0)),
      cash: Math.round(todays.filter((b) => b.paymentMode === "cash").reduce((s, b) => s + b.total, 0)),
      upi: Math.round(todays.filter((b) => b.paymentMode === "upi").reduce((s, b) => s + b.total, 0)),
      ...profitOf(todays),
      collected: Math.round(paidToday.reduce((s, p) => s + p.amount, 0)),
      bySource: (["voice", "whatsapp", "notebook", "manual", "text"] as Source[]).map((s) => ({
        source: s,
        count: todays.filter((b) => b.source === s).length,
      })),
    },
    days,
    top: [...rev.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topProfit: [...rev.values()].filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 5).map((r) => ({ ...r, profit: Math.round(r.profit) })),
    week: { sales: Math.round(week.reduce((s, b) => s + b.total, 0)), ...profitOf(week) },
    restock: fc.filter((f) => f.status === "out" || f.status === "critical" || f.status === "low"),
    dead: fc.filter((f) => f.status === "dead"),
    pattu: {
      total: Math.round(bal.reduce((s, b) => s + Math.max(0, b.due), 0)),
      people: bal.filter((b) => b.due > 0).length,
      top: bal.filter((b) => b.due > 0).slice(0, 4).map((b) => ({ id: b.customer.id, name: b.customer.name, nameMl: b.customer.nameMl, due: b.due, days: b.oldestUnpaidDays, trust: b.trust.label, over: b.due > b.trust.limit })),
    },
    activity,
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

/** Compact numbers about the shop, for Ask Kanakku. */
export async function shopFacts() {
  const store = getStore();
  const [products, bills, bal] = await Promise.all([store.listProducts(), store.listBills(28), balances()]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const fc = new Map(forecast(products, bills).map((f) => [f.product.id, f]));
  const now = Date.now();
  const per = new Map<string, { q7: number; r7: number; p7: number; q28: number; r28: number; p28: number }>();
  const daily = new Map<string, { sales: number; credit: number; upi: number; bills: number; profit: number }>();
  for (const b of bills) {
    const t = new Date(b.createdAt).getTime();
    const day = new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const d = daily.get(day) ?? { sales: 0, credit: 0, upi: 0, bills: 0, profit: 0 };
    d.sales += b.total; d.bills++;
    if (b.paymentMode === "credit") d.credit += b.total;
    if (b.paymentMode === "upi") d.upi += b.total;
    for (const i of b.items) {
      const pr = lineProfit(i, byId) ?? 0;
      d.profit += pr;
      if (!i.productId) continue;
      const x = per.get(i.productId) ?? { q7: 0, r7: 0, p7: 0, q28: 0, r28: 0, p28: 0 };
      x.q28 += i.qty; x.r28 += i.total; x.p28 += pr;
      if (now - t < 7 * DAY) { x.q7 += i.qty; x.r7 += i.total; x.p7 += pr; }
      per.set(i.productId, x);
    }
    daily.set(day, d);
  }
  const r = (n: number) => Math.round(n);
  return {
    shop: process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores",
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    weekday: new Date().toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }),
    daily: [...daily.entries()].sort().map(([day, d]) => ({ day, sales: r(d.sales), pattuGiven: r(d.credit), upi: r(d.upi), bills: d.bills, profit: r(d.profit) })),
    products: products.map((p) => {
      const x = per.get(p.id) ?? { q7: 0, r7: 0, p7: 0, q28: 0, r28: 0, p28: 0 };
      const f = fc.get(p.id);
      return {
        name: p.name, ml: p.nameMl, unit: p.unit, price: p.price, cost: p.costPrice ?? null, stock: p.stock,
        sold7d: r(x.q7 * 10) / 10, sales7d: r(x.r7), profit7d: r(x.p7), sold28d: r(x.q28 * 10) / 10, sales28d: r(x.r28), profit28d: r(x.p28),
        daysOfStockLeft: f?.daysLeft ?? null, status: f?.status, marginPct: f?.margin ?? null,
      };
    }),
    pattu: bal.map((b) => ({
      name: b.customer.name, ml: b.customer.nameMl, due: b.due, oldestUnpaidDays: b.oldestUnpaidDays,
      trust: b.trust.label, trustScore: b.trust.score, usualDaysToPay: b.trust.avgDaysToPay, suggestedLimit: b.trust.limit,
    })),
  };
}

/** 4-week business summary a bank can read: for MUDRA / small business loan applications. */
export async function businessReport() {
  const store = getStore();
  const [products, bills, payments] = await Promise.all([store.listProducts(), store.listBills(28), store.listPayments()]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const since = Date.now() - 28 * DAY;
  const mid = Date.now() - 14 * DAY;
  const sum = (l: Bill[]) => l.reduce((s, b) => s + b.total, 0);
  const recent = bills.filter((b) => new Date(b.createdAt).getTime() >= mid);
  const earlier = bills.filter((b) => new Date(b.createdAt).getTime() < mid);
  const days = new Map<string, number>();
  for (const b of bills) {
    const k = new Date(b.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    days.set(k, (days.get(k) ?? 0) + b.total);
  }
  const dayVals = [...days.values()];
  const total = sum(bills);
  const avg = dayVals.length ? total / dayVals.length : 0;
  const sd = dayVals.length ? Math.sqrt(dayVals.reduce((s, v) => s + (v - avg) ** 2, 0) / dayVals.length) : 0;
  let profit = 0, covered = 0;
  for (const b of bills) for (const i of b.items) {
    const p = lineProfit(i, byId);
    if (p !== null) { profit += p; covered += i.total; }
  }
  const credit = sum(bills.filter((b) => b.paymentMode === "credit"));
  const collected = payments.filter((p) => new Date(p.createdAt).getTime() >= since).reduce((s, p) => s + p.amount, 0);
  const bal = await balances();
  const best = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  const topItems = new Map<string, { name: string; revenue: number }>();
  for (const b of bills) for (const i of b.items) {
    const t = topItems.get(i.name) ?? { name: i.name, revenue: 0 };
    t.revenue += i.total;
    topItems.set(i.name, t);
  }
  const growth = sum(earlier) ? ((sum(recent) - sum(earlier)) / sum(earlier)) * 100 : null;
  return {
    shop: process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores",
    from: new Date(since).toISOString(),
    to: new Date().toISOString(),
    daysTrading: dayVals.length,
    totalSales: Math.round(total),
    avgDaily: Math.round(avg),
    monthlyRunRate: Math.round(avg * 30),
    consistency: avg ? Math.max(0, Math.round((1 - sd / avg) * 100)) : 0,
    bestDay: best ? { date: best[0], sales: Math.round(best[1]) } : null,
    growthPct: growth === null ? null : Math.round(growth * 10) / 10,
    bills: bills.length,
    avgBill: bills.length ? Math.round(total / bills.length) : 0,
    digitalShare: total ? Math.round((sum(bills.filter((b) => b.paymentMode === "upi")) / total) * 100) : 0,
    grossProfit: Math.round(profit),
    marginPct: covered ? Math.round((profit / covered) * 1000) / 10 : null,
    creditGiven: Math.round(credit),
    creditCollected: Math.round(collected),
    collectionRate: credit ? Math.min(100, Math.round((collected / credit) * 100)) : null,
    outstanding: Math.round(bal.reduce((s, b) => s + Math.max(0, b.due), 0)),
    creditCustomers: bal.filter((b) => b.credit > 0).length,
    reliableShare: bal.length ? Math.round((bal.filter((b) => b.trust.label === "Reliable").length / bal.length) * 100) : 0,
    topItems: [...topItems.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((t) => ({ ...t, revenue: Math.round(t.revenue) })),
    stockValue: Math.round(products.reduce((s, p) => s + p.stock * (p.costPrice ?? p.price), 0)),
  };
}

export type Report = Awaited<ReturnType<typeof businessReport>>;
