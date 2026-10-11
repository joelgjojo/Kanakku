import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getStore } from "@/lib/store";
import { customerLedger } from "@/lib/kanakku";
import { findByCode, upiLink } from "@/lib/links";
import { rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

const SHOP = process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores";

export const metadata: Metadata = { title: `Your pattu account · ${SHOP}`, robots: { index: false } };

// What a customer sees when the shop sends them their link: their own pattu book and a pay button.
export default async function CustomerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const customer = findByCode(await getStore().listCustomers(), code);
  if (!customer) notFound();
  const ledger = (await customerLedger(customer.id))!;
  const due = Math.max(0, ledger.due);
  const upi = due > 0 ? upiLink(due, `Pattu ${customer.name}`) : null;
  const qr = upi ? await QRCode.toString(upi, { type: "svg", margin: 1, color: { dark: "#18202e", light: "#fcfcfb" } }) : null;

  let running = 0;
  const rows = ledger.entries.map((e) => {
    running += e.kind === "credit" ? e.amount : -e.amount;
    return { ...e, balance: Math.round(running * 100) / 100 };
  });
  const recent = rows.slice(-15).reverse();

  return (
    <main className="min-h-dvh bg-wall px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <header>
          <p className="sign text-2xl">{SHOP}</p>
          <p className="text-muted">പറ്റ് കണക്ക് · Your pattu account</p>
        </header>

        <section className="panel p-5">
          <p className="text-muted">നമസ്കാരം {customer.nameMl ?? customer.name},</p>
          {due > 0 ? (
            <>
              <p className="mt-1">You have to pay</p>
              <p className="sign num text-[3.2rem] text-due leading-none mt-1">{rupees(due)}</p>
            </>
          ) : (
            <p className="sign text-3xl text-leaf mt-2">All paid. Nanni! 🙏</p>
          )}

          {upi && (
            <div className="mt-5 space-y-3">
              <a href={upi} className="flex items-center justify-center gap-2 h-12 rounded-lg bg-pen text-white font-semibold text-lg">
                Pay {rupees(due)} with UPI
              </a>
              <p className="text-center text-sm text-muted">Opens GPay, PhonePe or Paytm with the amount filled in</p>
              {qr && (
                <details className="text-center">
                  <summary className="cursor-pointer text-sm text-pen font-semibold">On a computer? Show QR code</summary>
                  <div className="mx-auto mt-3 w-52" dangerouslySetInnerHTML={{ __html: qr }} />
                </details>
              )}
            </div>
          )}
          {!upi && due > 0 && <p className="mt-4 text-[0.95rem] text-muted">Please pay at the shop when convenient. Nanni 🙏</p>}
        </section>

        <section className="panel overflow-hidden">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Your recent entries</h2>
          <ol className="ledger">
            {recent.length === 0 && <li className="ledger-row pl-14 text-faint">No entries yet.</li>}
            {recent.map((r) => (
              <li key={r.id} className="ledger-row grid grid-cols-[2.75rem_1fr_auto] pr-4 text-[0.92rem] gap-2">
                <span className="text-xs text-muted text-center num">{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
                <span className="truncate">{r.kind === "payment" ? "Paid, thank you" : r.text}</span>
                <span className={`num font-semibold ${r.kind === "credit" ? "text-due" : "text-leaf"}`}>
                  {r.kind === "credit" ? "+" : "−"}
                  {rupees(r.amount)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="text-center text-xs text-muted">
          Kept by {SHOP} with Kanakku. Something wrong? Tell the shop and they&apos;ll fix it.
        </p>
      </div>
    </main>
  );
}
