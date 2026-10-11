import { getStore } from "@/lib/store";
import { readNotebook } from "@/lib/ai";
import { toBillItems } from "@/lib/kanakku";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = await fileToMedia(form.get("image"));
    if (!image) throw new Error("Add a photo of the notebook page");
    const store = getStore();
    const [products, customers] = await Promise.all([store.listProducts(), store.listCustomers()]);
    const res = await readNotebook(image, products, customers);
    // Price every line against the catalogue so the review table is ready to save.
    const entries = res.entries.map((e) => ({ ...e, billItems: toBillItems(e.items, products) }));
    return ok({ rawText: res.rawText, entries });
  } catch (e) {
    return fail(e, 500);
  }
}
