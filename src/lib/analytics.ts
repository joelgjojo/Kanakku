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
      return { product, perDay: Math.round(perDay * 100) / 100, daysLeft: daysLeft === null ? null : Math.round(daysLeft * 10) / 10, reorderQty, status };
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
    };
  });

  // Top sellers this week by revenue.
  const weekAgo = Date.now() - 7 * DAY;
  const rev = new Map<string, { name: string; nameMl?: string; revenue: number; qty: number }>();
  for (const b of bills) {
    if (new Date(b.createdAt).getTime() < weekAgo) continue;
    for (const i of b.items) {
      const k = i.productId ?? i.name;
      const r = rev.get(k) ?? { name: i.name, nameMl: i.nameMl, revenue: 0, qty: 0 };
      r.revenue += i.total;
      r.qty += i.qty;
      rev.set(k, r);
    }
  }

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
      collected: Math.round(paidToday.reduce((s, p) => s + p.amount, 0)),
      bySource: (["voice", "whatsapp", "notebook", "manual", "text"] as Source[]).map((s) => ({
        source: s,
        count: todays.filter((b) => b.source === s).length,
      })),
    },
    days,
    top: [...rev.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    restock: fc.filter((f) => f.status === "out" || f.status === "critical" || f.status === "low"),
    dead: fc.filter((f) => f.status === "dead"),
    pattu: {
      total: Math.round(bal.reduce((s, b) => s + Math.max(0, b.due), 0)),
      people: bal.filter((b) => b.due > 0).length,
      top: bal.filter((b) => b.due > 0).slice(0, 4).map((b) => ({ id: b.customer.id, name: b.customer.name, nameMl: b.customer.nameMl, due: b.due, days: b.oldestUnpaidDays })),
    },
    activity,
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;
