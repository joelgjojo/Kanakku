import { importPurchase } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";
import type { Unit } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { items } = (await req.json()) as { items: { productId: string | null; name: string; nameMl?: string | null; qty: number; unit: Unit; unitCost: number }[] };
    const done = await importPurchase(items, "notebook");
    return ok({ done });
  } catch (e) {
    return fail(e);
  }
}
