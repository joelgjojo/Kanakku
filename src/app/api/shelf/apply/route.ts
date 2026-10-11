import { getStore } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { uid } from "@/lib/format";

// Accept the shelf count as the true stock for the chosen products.
export async function POST(req: Request) {
  try {
    const { counts } = (await req.json()) as { counts: { productId: string; counted: number }[] };
    const store = getStore();
    const products = await store.listProducts();
    let changed = 0;
    for (const c of counts) {
      const p = products.find((x) => x.id === c.productId);
      if (!p) continue;
      const delta = Math.round((c.counted - p.stock) * 1000) / 1000;
      if (!delta) continue;
      await store.adjustStock(p.id, delta);
      await store.insertStockMove({ id: uid("sm"), createdAt: new Date().toISOString(), productId: p.id, qty: delta, reason: "audit", source: "manual" });
      changed++;
    }
    return ok({ changed });
  } catch (e) {
    return fail(e);
  }
}
