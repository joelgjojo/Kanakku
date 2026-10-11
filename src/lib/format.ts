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

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
