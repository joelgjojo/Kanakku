"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Camera, FileText, MessageCircle, Mic, PenLine, ShieldAlert, Truck, Wallet } from "lucide-react";
import type { Dashboard } from "@/lib/analytics";
import { api, waLink } from "@/lib/client";
import { qtyLabel, rupees, timeAgo } from "@/lib/format";
import { SalesChart } from "@/components/SalesChart";
import { AskKanakku } from "@/components/AskKanakku";
import { ErrorNote, Money, PageHeader, SourceIcon, Spinner } from "@/components/ui";

export default function Today() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Dashboard>("/api/dashboard")
        .then((x) => { if (alive) { setD(x); setErr(null); setNow(Date.now()); } })
        .catch((e) => alive && setErr(e.message));
    load();
    // Live: bills from WhatsApp show up here within a few seconds.
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Set after load so the server-rendered page and the browser agree.
  const [date, setDate] = useState("\u00a0");
  useEffect(() => setDate(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })), []);

  if (!d) {
    return (
      <>
        <PageHeader title="Today" ml={date} />
        <div className="px-4 lg:px-8">{err ? <ErrorNote>{err}</ErrorNote> : <Spinner />}</div>
      </>
    );
  }

  const via = Object.fromEntries(d.today.bySource.map((s) => [s.source, s.count]));
  const supplierText = `Hi, please send:\n${d.restock.map((f) => `• ${f.product.name} (${f.product.nameMl}) – ${f.reorderQty} ${f.product.unit}`).join("\n")}`;

  return (
    <>
      <PageHeader title="Today" ml={date}>
        <Link href="/report" className="inline-flex items-center gap-2 h-10 rounded-lg border border-line bg-paper px-3 text-sm font-semibold hover:bg-wall">
          <FileText size={16} /> Loan report
        </Link>
        <Link href="/bill" className="inline-flex items-center gap-2 h-10 rounded-lg bg-pen px-4 font-semibold text-white hover:bg-pen-dark">
          <Mic size={17} /> New bill
        </Link>
      </PageHeader>

      <div className="px-4 lg:px-8 space-y-5">
        {/* Headline: today's takings and how the bills came in */}
        <section className="panel p-5 lg:p-6 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="text-muted">Sales so far</p>
            <p className="sign num text-[3.4rem] lg:text-[4.2rem] text-ink">{rupees(d.today.sales)}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.95rem]">
              <div><dt className="inline text-muted">Bills </dt><dd className="inline num font-semibold">{d.today.bills}</dd></div>
              {d.today.margin !== null && (
                <div title="Estimated from supplier bill prices">
                  <dt className="inline text-muted">Profit </dt>
                  <dd className="inline num font-semibold text-leaf">~{rupees(d.today.profit)}</dd>
                  <dd className="inline text-xs text-muted"> ({d.today.margin}%)</dd>
                </div>
              )}
              <div><dt className="inline text-muted">Pattu given </dt><dd className="inline num font-semibold text-due">{rupees(d.today.creditGiven)}</dd></div>
              <div><dt className="inline text-muted">Pattu collected </dt><dd className="inline num font-semibold text-leaf">{rupees(d.today.collected)}</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-muted mb-2">How today&apos;s bills came in, with no new app to learn</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { k: "voice", icon: Mic, label: "Voice" },
                { k: "whatsapp", icon: MessageCircle, label: "WhatsApp" },
                { k: "notebook", icon: Camera, label: "Notebook" },
                { k: "manual", icon: PenLine, label: "Typed" },
              ].map((s) => (
                <div key={s.k} className="rounded-lg bg-wall px-3 py-2.5">
                  <s.icon size={17} className="text-muted" />
                  <p className="num text-2xl font-semibold mt-1">{(via[s.k] ?? 0) + (s.k === "manual" ? via.text ?? 0 : 0)}</p>
                  <p className="text-xs text-muted">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <AskKanakku />

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5 min-w-0">
            <section className="panel p-5">
              <h2 className="text-lg font-semibold mb-3">Last 7 days</h2>
              <SalesChart days={d.days} />
            </section>

            {/* Live ledger */}
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <h2 className="text-lg font-semibold">Live book</h2>
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full bg-leaf animate-pulse" />Updates by itself</span>
              </div>
              <ol className="ledger">
                {d.activity.slice(0, 14).map((a) => (
                  <li key={a.id} className="ledger-row slip-in gap-3 pr-4 border-b border-transparent">
                    <span className="w-11 shrink-0 grid place-items-center"><SourceIcon source={a.source} /></span>
                    <span className="flex-1 min-w-0 truncate">
                      {a.customer && <span className="font-semibold">{a.customer}: </span>}
                      <span className={clsx(a.kind !== "bill" && "text-muted")}>{a.title}</span>
                    </span>
                    <span className="text-xs text-faint whitespace-nowrap hidden sm:inline">{timeAgo(a.at, now)}</span>
                    {a.kind !== "restock" && (
                      <Money
                        value={a.amount}
                        className={clsx("w-20 text-right font-semibold", a.kind === "payment" ? "text-leaf" : a.credit ? "text-due" : "text-pen")}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="space-y-5 min-w-0">
            <section className="panel p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Runs out soon</h2>
                <Link href="/stock" className="text-sm text-pen font-semibold">All stock</Link>
              </div>
              {d.restock.length === 0 ? (
                <p className="text-muted">Nothing will run out this week.</p>
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {d.restock.slice(0, 6).map((f) => (
                      <li key={f.product.id} className="py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{f.product.nameMl} <span className="font-normal text-muted text-sm">{f.product.name}</span></p>
                          <p className="text-sm text-muted num">{qtyLabel(f.product.stock, f.product.unit)} left · order {f.reorderQty} {f.product.unit}</p>
                        </div>
                        <span className={clsx("num text-sm font-semibold whitespace-nowrap rounded-md px-2 py-0.5", f.status === "out" || f.status === "critical" ? "bg-due-soft text-due" : "bg-warn-soft text-warn")}>
                          {f.status === "out" ? "Out" : f.daysLeft === null ? "Low" : f.daysLeft < 1 ? "Today" : Math.floor(f.daysLeft) === 1 ? "1 day" : `${Math.floor(f.daysLeft)} days`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={waLink(process.env.NEXT_PUBLIC_SUPPLIER_PHONE, supplierText)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 h-10 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-wall"
                  >
                    <Truck size={16} /> Send order to supplier
                  </a>
                </>
              )}
            </section>

            <section className="panel p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold">Pattu pending</h2>
                <Link href="/pattu" className="text-sm text-pen font-semibold">Pattu book</Link>
              </div>
              <p className="sign num text-4xl text-due">{rupees(d.pattu.total)}</p>
              <p className="text-sm text-muted mb-3">from {d.pattu.people} customers</p>
              <ul className="space-y-1.5">
                {d.pattu.top.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pattu?c=${p.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 -mx-1 hover:bg-wall">
                      <span className="truncate flex items-center gap-1.5">
                        {p.over && <ShieldAlert size={14} className="text-due shrink-0" aria-label="Over pattu limit" />}
                        {p.nameMl ?? p.name} {p.days > 7 && <span className="text-xs text-warn">· {p.days} days</span>}
                      </span>
                      <Money value={p.due} className="font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <DayClose cash={d.today.cash} collected={d.today.collected} upi={d.today.upi} />

            <BestSellers d={d} />
          </div>
        </div>
      </div>
    </>
  );
}

function BestSellers({ d }: { d: Dashboard }) {
  const [by, setBy] = useState<"sales" | "profit">("sales");
  const list = by === "sales" ? d.top.map((t) => ({ ...t, value: t.revenue })) : d.topProfit.map((t) => ({ ...t, value: t.profit }));
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">This week&apos;s best</h2>
        <div className="flex rounded-md bg-wall p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Rank by">
          {(["sales", "profit"] as const).map((k) => (
            <button key={k} role="radio" aria-checked={by === k} onClick={() => setBy(k)} className={clsx("rounded px-2 py-1", by === k ? "bg-paper text-ink" : "text-muted")}>
              {k === "sales" ? "Sales" : "Profit"}
            </button>
          ))}
        </div>
      </div>
      <ol className="space-y-1.5">
        {list.map((t, i) => (
          <li key={t.name} className="flex items-center gap-3">
            <span className="w-4 text-sm text-faint num">{i + 1}</span>
            <span className="flex-1 truncate">{t.nameMl ?? t.name}</span>
            <Money value={t.value} className={by === "profit" ? "text-leaf" : "text-muted"} />
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted">Scan a supplier bill to see profit per item.</li>}
      </ol>
      {d.week.margin !== null && (
        <p className="mt-3 text-sm text-muted">
          Week: <b className="num text-ink">{rupees(d.week.sales)}</b> sales, about <b className="num text-leaf">{rupees(d.week.profit)}</b> profit ({d.week.margin}%)
        </p>
      )}
      {d.dead.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Not sold in a week: <span className="text-ink">{d.dead.map((f) => f.product.nameMl).join(", ")}</span>
        </p>
      )}
    </section>
  );
}

/** End of day: does the cash drawer match the books? */
function DayClose({ cash, collected, upi }: { cash: number; collected: number; upi: number }) {
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const expected = Math.round((Number(opening) || 0) + cash + collected);
  const diff = counted === "" ? null : Math.round(Number(counted) - expected);
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={18} className="text-pen" />
        <h2 className="text-lg font-semibold">Close the day</h2>
      </div>
      <p className="text-sm text-muted">Count the cash drawer. Kanakku tells you if anything is missing.</p>
      <dl className="mt-3 space-y-1 text-[0.95rem]">
        <div className="flex justify-between"><dt className="text-muted">Cash sales</dt><dd className="num">{rupees(cash)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Pattu paid back in cash</dt><dd className="num">{rupees(collected)}</dd></div>
        <div className="flex justify-between text-faint"><dt>UPI (already in bank)</dt><dd className="num">{rupees(upi)}</dd></div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">Opening cash
          <input type="number" inputMode="decimal" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="₹0" className="num mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-[0.95rem] text-ink" />
        </label>
        <label className="text-xs text-muted">Cash counted now
          <input type="number" inputMode="decimal" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={`₹${expected}`} className="num mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-[0.95rem] text-ink" />
        </label>
      </div>
      <p className="mt-3 text-sm">Should be <b className="num">{rupees(expected)}</b></p>
      {diff !== null && (
        <p className={clsx("mt-2 rounded-lg px-3 py-2 text-sm font-semibold slip-in", Math.abs(diff) < 10 ? "bg-leaf-soft text-leaf" : diff < 0 ? "bg-due-soft text-due" : "bg-warn-soft text-warn")}>
          {Math.abs(diff) < 10 ? "✓ Drawer matches the books." : diff < 0 ? `${rupees(-diff)} short. A sale may not be billed, or change was given wrong.` : `${rupees(diff)} extra. A bill may have been missed or entered twice.`}
        </p>
      )}
    </section>
  );
}
