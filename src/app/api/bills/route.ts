import { getStore } from "@/lib/store";
import { createBill, customerDue } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";
import type { BillItem, PaymentMode, Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
  const bills = await getStore().listBills(days);
  return ok(bills.reverse());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string; items: BillItem[]; customerName?: string; customerId?: string; paymentMode: PaymentMode;
      source?: Source; rawInput?: string; createdAt?: string;
    };
    if (!body.items?.length) throw new Error("Add at least one item");
    const bill = await createBill({ ...body, source: body.source ?? "manual" });
    const due = bill.customerId ? await customerDue(bill.customerId) : null;
    return ok({ bill, due });
  } catch (e) {
    return fail(e);
  }
}
