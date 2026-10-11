"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Bell, Link2, Phone, Plus, QrCode, ShieldAlert, Wallet } from "lucide-react";
import { api, waLink } from "@/lib/client";
import { rupees } from "@/lib/format";
import type { Balance } from "@/lib/kanakku";
import type { Source } from "@/lib/types";
import { Button, ErrorNote, Money, PageHeader, SourceIcon, Spinner, inputCls } from "@/components/ui";

interface Entry { id: string; at: string; kind: "credit" | "payment"; amount: number; source: Source; text: string }
type Detail = Balance & { entries: Entry[]; link: string; upi: string | null };

const TRUST_CLS: Record<Balance["trust"]["label"], string> = {
  Reliable: "bg-leaf-soft text-leaf",
  Watch: "bg-warn-soft text-warn",
  Risky: "bg-due-soft text-due",
  New: "bg-wall text-muted",
};

function TrustBadge({ t }: { t: Balance["trust"] }) {
  return (
    <span title={t.reason} className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold", TRUST_CLS[t.label])}>
      {t.label} <span className="num font-normal opacity-80">{t.score}</span>
    </span>
  );
}

const SHOP = process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores";
const UPI = process.env.NEXT_PUBLIC_UPI_ID;

export default function PattuPage() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <Pattu />
    </Suspense>
  );
}

function Pattu() {
  const params = useSearchParams();
  const router = useRouter();
  const [list, setList] = useState<Balance[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = params.get("c");

  const loadList = useCallback(() => api<Balance[]>("/api/customers").then(setList), []);
  const loadDetail = useCallback((id: string) => api<Detail>(`/api/customers/${id}`).then(setDetail), []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (selected) loadDetail(selected);
    else if (list?.length && window.matchMedia("(min-width: 1024px)").matches) router.replace(`/pattu?c=${list[0].customer.id}`);
  }, [selected, list, loadDetail, router]);

  const total = list?.reduce((s, b) => s + Math.max(0, b.due), 0) ?? 0;
  const shown = list?.filter((b) => showAll || b.due > 0) ?? [];

  return (
    <>
      <PageHeader title="Pattu book" ml="പറ്റ് പുസ്തകം">
        {list && <p className="text-right"><span className="text-sm text-muted block">Total pending</span><span className="sign num text-3xl text-due">{rupees(total)}</span></p>}
      </PageHeader>
      <div className="px-4 lg:px-8 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-start">
        <section className={clsx("panel overflow-hidden", selected && "hidden lg:block")}>
          {!list ? <div className="p-5"><Spinner /></div> : (
            <>
              <ul className="divide-y divide-line">
                {shown.map((b) => (
                  <li key={b.customer.id}>
                    <button
                      onClick={() => router.push(`/pattu?c=${b.customer.id}`)}
                      className={clsx("w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-wall", selected === b.customer.id && "bg-pen-soft")}
                    >
                      <span className="grid place-items-center size-10 rounded-full bg-wall text-lg font-semibold text-pen-dark shrink-0">
                        {(b.customer.nameMl ?? b.customer.name).slice(0, 1)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{b.customer.nameMl ?? b.customer.name} <span className="font-normal text-sm text-muted">{b.customer.nameMl ? b.customer.name : ""}</span></span>
                        <span className={clsx("flex items-center gap-2 text-sm", b.oldestUnpaidDays > 7 ? "text-warn" : "text-muted")}>
                          <TrustBadge t={b.trust} />
                          <span className="truncate">{b.due <= 0 ? "All clear" : b.oldestUnpaidDays > 0 ? `unpaid ${b.oldestUnpaidDays} days` : "since today"}</span>
                        </span>
                      </span>
                      <Money value={Math.max(0, b.due)} className={clsx("font-semibold", b.due > 0 ? "text-due" : "text-leaf")} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between px-5 py-3 border-t border-line">
                <button onClick={() => setShowAll((s) => !s)} className="text-sm text-pen font-semibold">
                  {showAll ? "Only people who owe" : `Show all ${list.length} customers`}
                </button>
              </div>
              <AddCustomer onAdded={loadList} />
            </>
          )}
        </section>

        {selected && (
          <section className="min-w-0">
            <button onClick={() => router.push("/pattu")} className="lg:hidden mb-3 text-pen font-semibold text-sm">← All customers</button>
            {!detail || detail.customer.id !== selected ? <Spinner /> : (
              <CustomerPage d={detail} onChange={() => { loadDetail(selected); loadList(); }} />
            )}
          </section>
        )}
      </div>
    </>
  );
}

function CustomerPage({ d, onChange }: { d: Detail; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(d.customer.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const ledgerRef = useRef<HTMLOListElement>(null);
  // Open at the newest entries, like turning to the last page of the book.
  useEffect(() => { if (ledgerRef.current) ledgerRef.current.scrollTop = ledgerRef.current.scrollHeight; }, [d.entries.length, d.customer.id]);

  useEffect(() => { setPhone(d.customer.phone ?? ""); setPaid(null); setAmount(""); }, [d.customer.id, d.customer.phone]);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/payments", { json: { customerId: d.customer.id, amount: Number(amount) } });
      setPaid(Number(amount));
      setAmount("");
      onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const savePhone = async () => {
    if ((d.customer.phone ?? "") === phone) return;
    await api("/api/customers", { json: { id: d.customer.id, name: d.customer.name, phone } }).catch(() => {});
    onChange();
  };

  const nameMl = d.customer.nameMl ?? d.customer.name;
  const reminder = `നമസ്കാരം ${nameMl}, ${SHOP}-ൽ നിങ്ങളുടെ പറ്റ് ബാക്കി ${rupees(d.due)} ആണ്. സൗകര്യം പോലെ അടയ്ക്കാമോ?\nനിങ്ങളുടെ കണക്ക് കാണാനും UPI വഴി അടയ്ക്കാനും: ${d.link}${UPI ? `\nUPI: ${UPI}` : ""}\n\nHi ${d.customer.name}, your pending balance at ${SHOP} is ${rupees(d.due)}. See your account and pay here: ${d.link}\nNanni 🙏`;
  const overLimit = d.due > d.trust.limit;

  // Running balance down the page, like the shopkeeper's own book.
  let running = 0;
  const rows = d.entries.map((e) => {
    running += e.kind === "credit" ? e.amount : -e.amount;
    return { ...e, balance: Math.round(running * 100) / 100 };
  });

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="sign text-3xl">{nameMl}</h2>
            {d.customer.nameMl && <p className="text-muted">{d.customer.name}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <TrustBadge t={d.trust} />
              <span className="text-muted">{d.trust.reason}</span>
            </p>
            <p className="text-sm text-muted mt-0.5">Suggested pattu limit <b className="num text-ink">{rupees(d.trust.limit)}</b></p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">{d.due > 0 ? "Owes you" : "Balance"}</p>
            <p className={clsx("sign num text-4xl", d.due > 0 ? "text-due" : "text-leaf")}>{rupees(Math.max(0, d.due))}</p>
          </div>
        </div>
        {overLimit && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-due-soft px-3 py-2 text-sm text-due">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            Over the suggested limit by {rupees(d.due - d.trust.limit)}. Collect some before giving more pattu.
          </p>
        )}
        {paid !== null && <p className="mt-3 rounded-lg bg-leaf-soft px-3 py-2 text-sm text-leaf font-semibold slip-in">Payment of {rupees(paid)} added.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <form onSubmit={pay} className="flex gap-2">
            <label className="sr-only" htmlFor="amt">Amount paid</label>
            <input id="amt" type="number" inputMode="decimal" min={1} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount paid ₹" className={inputCls} />
            <Button type="submit" busy={busy} disabled={!amount} variant="primary" className="bg-leaf hover:bg-[#23643d] shrink-0"><Wallet size={16} />Paid</Button>
          </form>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePhone} inputMode="tel" placeholder="WhatsApp number" className={clsx(inputCls, "pl-8")} aria-label="WhatsApp number" />
            </div>
            <a
              href={waLink(phone, reminder)}
              target="_blank"
              rel="noreferrer"
              aria-disabled={d.due <= 0}
              className={clsx("inline-flex items-center gap-2 h-10 rounded-lg border border-line px-3 text-sm font-semibold shrink-0", d.due <= 0 ? "pointer-events-none opacity-40" : "hover:bg-wall")}
            >
              <Bell size={15} /> Remind
            </a>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PayQr upi={d.upi} due={d.due} />
          <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-9 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-wall">
            <Link2 size={15} /> {d.customer.name}&apos;s page
          </a>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <p className="mt-3 text-xs text-muted">Reminders open in WhatsApp with the message and {d.customer.name}&apos;s own pattu page link ready. Nothing goes out until you press send.</p>
      </div>

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[2.75rem_3.75rem_1fr_4.75rem_5rem] items-end px-0 pr-4 pt-3 pb-1 text-xs text-muted border-b border-line">
          <span /><span className="pl-2">Date</span><span>Entry</span><span className="text-right">Amount</span><span className="text-right">Balance</span>
        </div>
        <ol ref={ledgerRef} className="ledger max-h-[32rem] overflow-y-auto">
          {rows.length === 0 && <li className="ledger-row pl-14 text-faint">No entries yet.</li>}
          {rows.map((r) => (
            <li key={r.id} className="ledger-row grid grid-cols-[2.75rem_3.75rem_1fr_4.75rem_5rem] pr-4 text-[0.92rem]">
              <span className="grid place-items-center"><SourceIcon source={r.source} size={14} /></span>
              <span className="pl-2 text-muted num text-sm">{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              <span className="truncate pr-2">{r.text}</span>
              <span className={clsx("num text-right", r.kind === "credit" ? "text-due" : "text-leaf")}>
                {r.kind === "credit" ? "+" : "−"}{rupees(r.amount)}
              </span>
              <span className="num text-right font-semibold">{rupees(r.balance)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function AddCustomer({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameMl, setNameMl] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return (
    <div className="px-5 pb-4"><Button variant="outline" onClick={() => setOpen(true)}><Plus size={16} />Add customer</Button></div>
  );
  return (
    <form
      className="px-5 pb-5 grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await api("/api/customers", { json: { name, nameMl, phone } }).catch(() => {});
        setBusy(false); setOpen(false); setName(""); setNameMl(""); setPhone("");
        onAdded();
      }}
    >
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (English)" className={inputCls} />
      <input value={nameMl} onChange={(e) => setNameMl(e.target.value)} placeholder="പേര് (Malayalam, optional)" className={inputCls} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp number with 91" inputMode="tel" className={inputCls} />
      <div className="flex gap-2"><Button type="submit" busy={busy}>Add customer</Button><Button type="button" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button></div>
    </form>
  );
}

/** Show a UPI QR on screen so the customer can pay the exact due right at the counter. */
function PayQr({ upi, due }: { upi: string | null; due: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); setSvg(null); }, [upi]);
  // No UPI ID set for the shop: customers pay at the counter, so there's nothing to show.
  if (due <= 0 || !upi) return null;
  return (
    <>
      <button
        onClick={async () => {
          if (!svg) {
            const QR = (await import("qrcode")).default;
            setSvg(await QR.toString(upi, { type: "svg", margin: 1, color: { dark: "#18202e", light: "#fcfcfb" } }));
          }
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-2 h-9 rounded-lg bg-ink text-paper px-3 text-sm font-semibold"
      >
        <QrCode size={15} /> {open ? "Hide QR" : `Scan to pay ${rupees(due)}`}
      </button>
      {open && svg && (
        <div className="w-full flex flex-col items-center gap-1 py-3 slip-in">
          <div className="w-56" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-sm text-muted">Any UPI app. Amount is filled in: <b className="num text-ink">{rupees(due)}</b></p>
        </div>
      )}
    </>
  );
}
