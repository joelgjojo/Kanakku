import { getStore } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { uid } from "@/lib/format";

// Stock arrived (+qty) or a correction after counting (set to a new value).
export async function POST(req: Request) {
  try {
    const { productId, qty, setTo, reason = "restock" } = (await req.json()) as {
      productId: string; qty?: number; setTo?: number; reason?: "restock" | "audit" | "manual";
    };
    const store = getStore();
    const p = (await store.listProducts()).find((x) => x.id === productId);
    if (!p) throw new Error("Unknown product");
    const delta = setTo !== undefined ? Number(setTo) - p.stock : Number(qty);
    if (!Number.isFinite(delta) || delta === 0) return ok({ product: p });
    await store.adjustStock(p.id, delta);
    await store.insertStockMove({ id: uid("sm"), createdAt: new Date().toISOString(), productId: p.id, qty: delta, reason, source: "manual" });
    return ok({ product: { ...p, stock: p.stock + delta } });
  } catch (e) {
    return fail(e);
  }
}
