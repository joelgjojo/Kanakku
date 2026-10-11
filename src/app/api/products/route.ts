import { getStore } from "@/lib/store";
import { forecast } from "@/lib/analytics";
import { fail, ok } from "@/lib/http";
import { uid } from "@/lib/format";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const [products, bills] = await Promise.all([store.listProducts(), store.listBills(15)]);
  return ok({ products, forecast: forecast(products, bills) });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Product>;
    if (!body.name?.trim()) throw new Error("Product needs a name");
    const p: Product = {
      id: body.id || uid("p"),
      name: body.name.trim(),
      nameMl: body.nameMl?.trim() ?? "",
      aliases: body.aliases ?? [],
      unit: body.unit ?? "pc",
      price: Number(body.price) || 0,
      stock: Number(body.stock) || 0,
      lowStockAt: Number(body.lowStockAt) || 0,
      category: body.category?.trim() || "Other",
    };
    return ok(await getStore().upsertProduct(p));
  } catch (e) {
    return fail(e);
  }
}
