import { getStore } from "@/lib/store";
import { balances } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

// One customer's pattu page: credit bills and payments, oldest first.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = getStore();
  const bal = (await balances()).find((b) => b.customer.id === id);
  if (!bal) return fail("Customer not found", 404);
  const [bills, payments] = await Promise.all([store.listBills(), store.listPayments()]);
  const entries = [
    ...bills.filter((b) => b.customerId === id && b.paymentMode === "credit").map((b) => ({
      id: b.id, at: b.createdAt, kind: "credit" as const, amount: b.total, source: b.source,
      text: b.items.map((i) => `${i.nameMl ?? i.name} ${i.qty}${i.unit === "pc" ? "" : " " + i.unit}`).join(", "),
    })),
    ...payments.filter((p) => p.customerId === id).map((p) => ({
      id: p.id, at: p.createdAt, kind: "payment" as const, amount: p.amount, source: p.source, text: p.note ?? "Paid",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return ok({ ...bal, entries });
}
