import { getStore } from "@/lib/store";
import { balances } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";
import { uid } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await balances());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Customer>;
    if (!body.name?.trim()) throw new Error("Customer needs a name");
    const store = getStore();
    const existing = body.id ? (await store.listCustomers()).find((c) => c.id === body.id) : undefined;
    const c: Customer = {
      ...(existing ?? { id: uid("c"), aliases: [], createdAt: new Date().toISOString() }),
      name: body.name.trim(),
      nameMl: body.nameMl?.trim() || existing?.nameMl,
      phone: body.phone?.replace(/\D/g, "") || undefined,
    } as Customer;
    return ok(await store.upsertCustomer(c));
  } catch (e) {
    return fail(e);
  }
}
