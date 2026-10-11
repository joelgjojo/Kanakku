import { customerLedger } from "@/lib/kanakku";
import { customerLink, upiLink } from "@/lib/links";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

// One customer's pattu page: credit bills and payments, oldest first, plus their share link.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ledger = await customerLedger(id);
  if (!ledger) return fail("Customer not found", 404);
  return ok({ ...ledger, link: customerLink(id), upi: ledger.due > 0 ? upiLink(ledger.due, `Pattu ${ledger.customer.name}`) : null });
}
