// Messages Kanakku sends the shop owner on its own, without being asked:
//   morning (around 8 am): what to order today and whose pattu to collect
//   evening (around 9 pm): how the day went and what the cash drawer should hold
// The WhatsApp bridge sends these on a timer. They can also be asked for with "morning" / "evening".
import { getStore } from "./store";
import { balances } from "./kanakku";
import { forecast, lineProfit } from "./analytics";
import { qtyLabel, rupees, startOfDay } from "./format";
import type { Bill, Product } from "./types";

const DAY = 86400000;

export type DigestKind = "morning" | "evening";

function dayStats(bills: Bill[], from: number, to: number, byId: Map<string, Product>) {
  const list = bills.filter((b) => {
    const t = new Date(b.createdAt).getTime();
    return t >= from && t < to;
  });
  let profit = 0, covered = 0;
  for (const b of list) for (const i of b.items) {
    const p = lineProfit(i, byId);
    if (p !== null) { profit += p; covered += i.total; }
  }
  const sum = (f: (b: Bill) => boolean) => Math.round(list.filter(f).reduce((s, b) => s + b.total, 0));
  return {
    bills: list.length,
    sales: sum(() => true),
    cash: sum((b) => b.paymentMode === "cash"),
    upi: sum((b) => b.paymentMode === "upi"),
    credit: sum((b) => b.paymentMode === "credit"),
    profit: Math.round(profit),
    margin: covered ? Math.round((profit / covered) * 1000) / 10 : null,
  };
}

const change = (now: number, before: number) => {
  if (!before) return "";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? " (same as last week)" : ` (${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs last week)`;
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function digest(kind: DigestKind): Promise<string> {
  const store = getStore();
  const [products, bills, payments, bal] = await Promise.all([
    store.listProducts(),
    store.listBills(15),
    store.listPayments(),
    balances(),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const today = startOfDay().getTime();
  const fc = forecast(products, bills);

  // Pattu worth chasing: over the limit first, then the oldest unpaid.
  const chase = bal
    .filter((b) => b.due > 0 && (b.due > b.trust.limit || b.oldestUnpaidDays > 14 || b.trust.label === "Risky"))
    .sort((a, b) => Number(b.due > b.trust.limit) - Number(a.due > a.trust.limit) || b.oldestUnpaidDays - a.oldestUnpaidDays)
    .slice(0, 3);
  const chaseLines = chase.map(
    (b) => `• ${b.customer.nameMl ?? b.customer.name}: ${rupees(b.due)}, ${b.oldestUnpaidDays} days${b.due > b.trust.limit ? " 🛑 over limit" : ""}`,
  );

  if (kind === "morning") {
    const y = dayStats(bills, today - DAY, today, byId);
    const lastWeek = dayStats(bills, today - 8 * DAY, today - 7 * DAY, byId);
    const order = fc.filter((f) => f.status === "out" || f.status === "critical" || f.status === "low").slice(0, 6);
    const dead = fc.filter((f) => f.status === "dead" && f.product.stock > 0)[0];
    const best = [...fc].filter((f) => f.margin !== null && f.perDay > 0).sort((a, b) => b.perDay * (b.margin ?? 0) * b.product.price - a.perDay * (a.margin ?? 0) * a.product.price)[0];

    let out = `☀️ സുപ്രഭാതം! Today's plan from Kanakku\n`;
    out += `\nYesterday: *${rupees(y.sales)}* from ${y.bills} bills${change(y.sales, lastWeek.sales)}`;
    if (y.margin !== null) out += `\nProfit about ${rupees(y.profit)} (${y.margin}%)`;
    if (order.length) {
      out += `\n\n🛒 Order today\n${order.map((f) => `• ${f.product.nameMl}: ${qtyLabel(f.reorderQty, f.product.unit)}${f.daysLeft !== null ? ` (lasts ~${f.daysLeft} days)` : " (out)"}`).join("\n")}`;
    } else out += `\n\n✅ Stock is fine for the next few days.`;
    if (chaseLines.length) out += `\n\n📒 Collect pattu today\n${chaseLines.join("\n")}`;
    if (best) out += `\n\n💡 ${best.product.nameMl} earns you the most each day. Keep it on the front shelf.`;
    else if (dead) out += `\n\n💡 ${dead.product.nameMl} hasn't sold in a week. Order less of it.`;
    out += `\n\nReply "stock" or "pattu" for the full list.`;
    return out;
  }

  const t = dayStats(bills, today, today + DAY, byId);
  const lastWeek = dayStats(bills, today - 7 * DAY, today - 6 * DAY, byId);
  const collected = Math.round(payments.filter((p) => new Date(p.createdAt).getTime() >= today).reduce((s, p) => s + p.amount, 0));
  const tomorrow = fc.filter((f) => f.status === "out" || f.status === "critical").slice(0, 4);
  const dayName = WEEKDAY[new Date(today + 330 * 60000).getUTCDay()];

  let out = `🌙 ഇന്നത്തെ കണക്ക് · Day closed\n`;
  out += `\nSales: *${rupees(t.sales)}* from ${t.bills} bills${change(t.sales, lastWeek.sales).replace("vs last week", `vs last ${dayName}`)}`;
  if (t.margin !== null) out += `\nProfit: about *${rupees(t.profit)}* (${t.margin}%)`;
  out += `\nCash ${rupees(t.cash)} · UPI ${rupees(t.upi)} · Pattu ${rupees(t.credit)}`;
  if (collected) out += `\nPattu paid back: ${rupees(collected)}`;
  out += `\n\n💵 Cash drawer should have ${rupees(t.cash + collected)} more than this morning. Count it, and tell Kanakku if it's short.`;
  if (tomorrow.length) out += `\n\n⚠️ Runs out tomorrow: ${tomorrow.map((f) => f.product.nameMl).join(", ")}`;
  if (chaseLines.length) out += `\n\n📒 Pattu to follow up\n${chaseLines.join("\n")}`;
  out += `\n\nശുഭരാത്രി 🙏`;
  return out;
}
