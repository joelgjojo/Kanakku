import { getStore } from "@/lib/store";
import { readPurchaseBill } from "@/lib/ai";
import { findProduct } from "@/lib/kanakku";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

// Photo of a supplier bill → lines to review before stock is added.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = await fileToMedia(form.get("image"));
    if (!image) throw new Error("Add a photo of the supplier bill");
    const products = await getStore().listProducts();
    const res = await readPurchaseBill(image, products);
    const items = res.items.map((i) => {
      const p = (i.productId && products.find((x) => x.id === i.productId)) || findProduct(products, i.name) || null;
      return { ...i, productId: p?.id ?? null, nameMl: p?.nameMl ?? i.nameMl ?? null, unit: p?.unit ?? i.unit, sellPrice: p?.price ?? null, oldCost: p?.costPrice ?? null };
    });
    return ok({ ...res, items });
  } catch (e) {
    return fail(e, 500);
  }
}
