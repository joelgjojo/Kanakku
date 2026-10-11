import { recordPayment, customerDue } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { customerId, amount } = (await req.json()) as { customerId: string; amount: number };
    const { customer, payment } = await recordPayment(null, Number(amount), "manual", customerId);
    return ok({ payment, due: await customerDue(customer.id) });
  } catch (e) {
    return fail(e);
  }
}
