import { getStore } from "@/lib/store";
import { auditShelf } from "@/lib/ai";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = await fileToMedia(form.get("image"));
    if (!image) throw new Error("Add a photo of the shelf");
    const products = await getStore().listProducts();
    const res = await auditShelf(image, products);
    const rows = res.items.map((c) => {
      const p = products.find((x) => x.id === c.productId);
      return { ...c, product: p ?? null, recorded: p?.stock ?? null, diff: p ? Math.round((c.counted - p.stock) * 100) / 100 : null };
    });
    return ok({ rows, notes: res.notes });
  } catch (e) {
    return fail(e, 500);
  }
}
