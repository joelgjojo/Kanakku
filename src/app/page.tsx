"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Camera, MessageCircle, Mic, PenLine, Truck } from "lucide-react";
import type { Dashboard } from "@/lib/analytics";
import { api, waLink } from "@/lib/client";
import { qtyLabel, rupees, timeAgo } from "@/lib/format";
import { SalesChart } from "@/components/SalesChart";
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
                      <span className="truncate">{p.nameMl ?? p.name} {p.days > 7 && <span className="text-xs text-warn">· {p.days} days</span>}</span>
                      <Money value={p.due} className="font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel p-5">
              <h2 className="text-lg font-semibold mb-2">Best sellers this week</h2>
              <ol className="space-y-1.5">
                {d.top.map((t, i) => (
                  <li key={t.name} className="flex items-center gap-3">
                    <span className="w-4 text-sm text-faint num">{i + 1}</span>
                    <span className="flex-1 truncate">{t.nameMl ?? t.name}</span>
                    <Money value={t.revenue} className="text-muted" />
                  </li>
                ))}
              </ol>
              {d.dead.length > 0 && (
                <p className="mt-4 text-sm text-muted">
                  Not sold in a week: <span className="text-ink">{d.dead.map((f) => f.product.nameMl).join(", ")}</span>
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
