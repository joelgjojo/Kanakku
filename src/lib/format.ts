import type { Unit } from "./types";

export const rupees = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: n % 1 ? 2 : 0 }).format(Math.round(n * 100) / 100);

export const unitLabel: Record<Unit, string> = { kg: "kg", l: "L", pc: "pc", pkt: "pkt" };
export const unitMl: Record<Unit, string> = { kg: "കിലോ", l: "ലിറ്റർ", pc: "എണ്ണം", pkt: "പാക്കറ്റ്" };

export function qtyLabel(qty: number, unit: Unit) {
  if (unit === "kg" && qty < 1) return `${Math.round(qty * 1000)} g`;
  if (unit === "l" && qty < 1) return `${Math.round(qty * 1000)} ml`;
  const q = Math.round(qty * 100) / 100;
  return `${q} ${unitLabel[unit]}`;
}

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function timeAgo(iso: string, now = Date.now(), ml = false) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return ml ? "ഇപ്പോൾ" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return ml ? `${m} മിനിറ്റ് മുൻപ്` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return ml ? `${h} മണിക്കൂർ മുൻപ്` : `${h} hr ago`;
  const d = Math.round(h / 24);
  if (ml) return d === 1 ? "ഇന്നലെ" : `${d} ദിവസം മുൻപ്`;
  return d === 1 ? "yesterday" : `${d} days ago`;
}

// The shop is in India. Servers (Vercel) run on UTC, so "today" is always worked out in IST.
const IST = 330 * 60000;
const DAY_MS = 86400000;

/** Midnight IST of the day `d` falls in. */
export const startOfDay = (d = new Date()) => new Date(Math.floor((d.getTime() + IST) / DAY_MS) * DAY_MS - IST);

/** A time of day (IST) on the day that starts at `dayStart`. */
export const atIST = (dayStart: Date, h: number, m = 0, s = 0) => new Date(dayStart.getTime() + ((h * 60 + m) * 60 + s) * 1000);

/** Today's date in India as YYYY-MM-DD. */
export const istDate = (d = new Date()) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
