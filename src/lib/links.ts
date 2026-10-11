// Private links for customers to see their own pattu page and pay by UPI.
import crypto from "crypto";
import type { Customer } from "./types";

const secret = () => process.env.KANAKKU_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "kanakku-demo-links";

/** Short unguessable code per customer, e.g. /k/Qm3xT9aZpL */
export const customerCode = (customerId: string) =>
  crypto.createHmac("sha256", secret()).update(customerId).digest("base64url").slice(0, 10);

export const findByCode = (customers: Customer[], code: string) => customers.find((c) => customerCode(c.id) === code);

/** Public address of the app, for links sent on WhatsApp. */
export function appUrl() {
  const u = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || "http://localhost:3000";
  return u.replace(/\/$/, "");
}

export const customerLink = (customerId: string) => `${appUrl()}/k/${customerCode(customerId)}`;

/** UPI deep link that opens GPay/PhonePe/Paytm with the amount filled in. */
export function upiLink(amount: number, note: string) {
  const pa = process.env.NEXT_PUBLIC_UPI_ID;
  if (!pa) return null;
  const q = new URLSearchParams({
    pa,
    pn: process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores",
    am: (Math.round(amount * 100) / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
