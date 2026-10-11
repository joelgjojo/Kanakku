import { handleMessage } from "@/lib/bot";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

// In-app WhatsApp simulator: same brain as the real WhatsApp number.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = (form.get("text") as string | null) ?? "";
    const media = await fileToMedia(form.get("media"));
    return ok(await handleMessage({ text, media, source: "whatsapp" }));
  } catch (e) {
    return fail(e, 500);
  }
}
