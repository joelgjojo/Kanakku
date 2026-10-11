import { askShop } from "@/lib/ai";
import { shopFacts } from "@/lib/analytics";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

// Ask Kanakku anything about the shop, typed or spoken, in Malayalam or English.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = (form.get("question") as string | null)?.trim() || undefined;
    const audio = await fileToMedia(form.get("audio"));
    if (!text && !audio) throw new Error("Ask a question first");
    return ok(await askShop({ text, audio }, await shopFacts()));
  } catch (e) {
    return fail(e, 500);
  }
}
