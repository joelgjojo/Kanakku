import { hasGemini } from "@/lib/ai/gemini";
import { getStore } from "@/lib/store";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    ai: hasGemini() ? "gemini" : "offline",
    store: getStore().kind,
    whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) || !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    whatsappVia: process.env.WHATSAPP_TOKEN ? "meta" : process.env.TWILIO_ACCOUNT_SID ? "twilio" : null,
    shopName: process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores",
  });
}
