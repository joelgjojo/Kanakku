import { getStore } from "@/lib/store";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    ai: process.env.GEMINI_API_KEY ? "gemini" : "offline",
    store: getStore().kind,
    whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    shopName: process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores",
  });
}
