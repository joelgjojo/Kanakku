import { createBill, recordPayment } from "@/lib/kanakku";
import { fail, ok } from "@/lib/http";
import type { BillItem } from "@/lib/types";

interface Entry {
  kind: "sale" | "payment";
  date: string | null;
  customerName: string | null;
  isCredit: boolean;
  amount: number;
  lineText: string;
  billItems: BillItem[];
}

export async function POST(req: Request) {
  try {
    const { entries } = (await req.json()) as { entries: Entry[] };
    const today = new Date().toISOString().slice(0, 10);
    let sales = 0, payments = 0, total = 0;
    for (const e of entries) {
      if (e.kind === "payment") {
        if (!e.customerName || !(e.amount > 0)) continue;
        await recordPayment(e.customerName, e.amount, "notebook");
        payments++;
        continue;
      }
      let items = e.billItems.filter((i) => i.qty > 0);
      // A line with only a total ("Babu - 240") still counts as a sale.
      if (!items.length && e.amount > 0) items = [{ productId: null, name: e.lineText.slice(0, 40) || "Notebook entry", qty: 1, unit: "pc", price: e.amount, total: e.amount }];
      if (!items.length) continue;
      // The amount written in the book is what the customer was charged. Keep it exact.
      const calc = items.reduce((s, i) => s + i.qty * i.price, 0);
      if (e.amount > 0 && Math.abs(e.amount - calc) >= 1) {
        const diff = Math.round((e.amount - calc) * 100) / 100;
        items = [...items, { productId: null, name: "As written in book", qty: 1, unit: "pc", price: diff, total: diff }];
      }
      const bill = await createBill({
        items,
        customerName: e.customerName,
        paymentMode: e.isCredit && e.customerName ? "credit" : "cash",
        source: "notebook",
        rawInput: e.lineText,
        createdAt: e.date && e.date !== today ? new Date(`${e.date}T12:00:00`).toISOString() : undefined,
        affectStock: !e.date || e.date >= today,
      });
      sales++;
      total += bill.total;
    }
    return ok({ sales, payments, total });
  } catch (e) {
    return fail(e);
  }
}
