import { getStore } from "@/lib/store";
import { parseMessage } from "@/lib/ai";
import { lastCall } from "@/lib/ai/gemini";
import { toBillItems } from "@/lib/kanakku";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 30;

// Voice or text → structured bill (not saved yet; the shopkeeper confirms first).
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = (form.get("text") as string | null)?.trim() || undefined;
    const audio = await fileToMedia(form.get("audio"));
    if (!text && !audio) throw new Error("Say or type something first");
    const store = getStore();
    const [products, customers] = await Promise.all([store.listProducts(), store.listCustomers()]);
    const parsed = await parseMessage({ text, audio }, products, customers);
    return ok({ parsed, items: toBillItems(parsed.items, products), ai: parsed.engine === "gemini" ? lastCall : null });
  } catch (e) {
    return fail(e, 500);
  }
}
