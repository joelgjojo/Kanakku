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
import { daysLabel, useLang } from "@/lib/i18n";

export default function Today() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { t, ml } = useLang();

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
  useEffect(() => setDate(new Date().toLocaleDateString(ml ? "ml-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long" })), [ml]);

  if (!d) {
    return (
      <>
        <PageHeader title="Today" titleMl="ഇന്ന്" ml={date} />
        <div className="px-4 lg:px-8">{err ? <ErrorNote>{err}</ErrorNote> : <Spinner />}</div>
      </>
    );
  }

  const via = Object.fromEntries(d.today.bySource.map((s) => [s.source, s.count]));
  const supplierText = `Hi, please send:\n${d.restock.map((f) => `• ${f.product.name} (${f.product.nameMl}) – ${f.reorderQty} ${f.product.unit}`).join("\n")}`;

  return (
    <>
      <PageHeader title="Today" titleMl="ഇന്ന്" ml={date}>
        <Link href="/report" className="inline-flex items-center gap-2 h-10 rounded-lg border border-line bg-paper px-3 text-sm font-semibold hover:bg-wall">
          <FileText size={16} /> {t("Loan report", "ലോൺ റിപ്പോർട്ട്")}
        </Link>
        <Link href="/bill" className="inline-flex items-center gap-2 h-10 rounded-lg bg-pen px-4 font-semibold text-white hover:bg-pen-dark">
          <Mic size={17} /> {t("New bill", "പുതിയ ബിൽ")}
        </Link>
      </PageHeader>

      <div className="px-4 lg:px-8 space-y-5">
        {/* Headline: today's takings and how the bills came in */}
        <section className="panel p-5 lg:p-6 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="text-muted">{t("Sales so far", "ഇതുവരെയുള്ള വിൽപ്പന")}</p>
            <p className="sign num text-[3.4rem] lg:text-[4.2rem] text-ink">{rupees(d.today.sales)}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.95rem]">
              <div><dt className="inline text-muted">{t("Bills", "ബില്ലുകൾ")} </dt><dd className="inline num font-semibold">{d.today.bills}</dd></div>
              {d.today.margin !== null && (
                <div title={t("Estimated from supplier bill prices", "സപ്ലയർ ബില്ലിലെ വിലയിൽ നിന്ന് കണക്കാക്കിയത്")}>
                  <dt className="inline text-muted">{t("Profit", "ലാഭം")} </dt>
                  <dd className="inline num font-semibold text-leaf">~{rupees(d.today.profit)}</dd>
                  <dd className="inline text-xs text-muted"> ({d.today.margin}%)</dd>
                </div>
              )}
              <div><dt className="inline text-muted">{t("Pattu given", "പറ്റ് കൊടുത്തത്")} </dt><dd className="inline num font-semibold text-due">{rupees(d.today.creditGiven)}</dd></div>
              <div><dt className="inline text-muted">{t("Pattu collected", "പറ്റ് കിട്ടിയത്")} </dt><dd className="inline num font-semibold text-leaf">{rupees(d.today.collected)}</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-muted mb-2">{t("How today's bills came in, with no new app to learn", "ഇന്നത്തെ ബില്ലുകൾ വന്ന വഴി, പുതിയ ആപ്പ് ഒന്നും പഠിക്കാതെ")}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { k: "voice", icon: Mic, label: t("Voice", "ശബ്ദം") },
                { k: "whatsapp", icon: MessageCircle, label: t("WhatsApp", "വാട്സ്ആപ്പ്") },
                { k: "notebook", icon: Camera, label: t("Notebook", "നോട്ട്ബുക്ക്") },
                { k: "manual", icon: PenLine, label: t("Typed", "ടൈപ്പ് ചെയ്തത്") },
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
              <h2 className="text-lg font-semibold mb-3">{t("Last 7 days", "കഴിഞ്ഞ 7 ദിവസം")}</h2>
              <SalesChart days={d.days} />
            </section>

            {/* Live ledger */}
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <h2 className="text-lg font-semibold">{t("Live book", "തത്സമയ കണക്ക്")}</h2>
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full bg-leaf animate-pulse" />{t("Updates by itself", "തനിയെ പുതുക്കും")}</span>
              </div>
              <ol className="ledger">
                {d.activity.slice(0, 14).map((a) => (
                  <li key={a.id} className="ledger-row slip-in gap-3 pr-4 border-b border-transparent">
                    <span className="w-11 shrink-0 grid place-items-center"><SourceIcon source={a.source} /></span>
                    <span className="flex-1 min-w-0 truncate">
                      {a.customer && <span className="font-semibold">{a.customer}: </span>}
                      <span className={clsx(a.kind !== "bill" && "text-muted")}>{ml ? a.title.replace("Pattu payment", "പറ്റ് അടച്ചു").replace("Stock in:", "സ്റ്റോക്ക് വന്നു:") : a.title}</span>
                    </span>
                    <span className="text-xs text-faint whitespace-nowrap hidden sm:inline">{timeAgo(a.at, now, ml)}</span>
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
                <h2 className="text-lg font-semibold">{t("Runs out soon", "ഉടൻ തീരുന്നവ")}</h2>
                <Link href="/stock" className="text-sm text-pen font-semibold">{t("All stock", "എല്ലാ സ്റ്റോക്കും")}</Link>
              </div>
              {d.restock.length === 0 ? (
                <p className="text-muted">{t("Nothing will run out this week.", "ഈ ആഴ്ച ഒന്നും തീരില്ല.")}</p>
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {d.restock.slice(0, 6).map((f) => (
                      <li key={f.product.id} className="py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{f.product.nameMl} <span className="font-normal text-muted text-sm">{f.product.name}</span></p>
                          <p className="text-sm text-muted num">{ml ? `${qtyLabel(f.product.stock, f.product.unit)} ബാക്കി · ${f.reorderQty} ${f.product.unit} വാങ്ങണം` : `${qtyLabel(f.product.stock, f.product.unit)} left · order ${f.reorderQty} ${f.product.unit}`}</p>
                        </div>
                        <span className={clsx("num text-sm font-semibold whitespace-nowrap rounded-md px-2 py-0.5", f.status === "out" || f.status === "critical" ? "bg-due-soft text-due" : "bg-warn-soft text-warn")}>
                          {f.status === "out" ? t("Out", "തീർന്നു") : f.daysLeft === null ? t("Low", "കുറവ്") : f.daysLeft < 1 ? t("Today", "ഇന്ന്") : daysLabel(Math.floor(f.daysLeft), ml)}
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
                    <Truck size={16} /> {t("Send order to supplier", "സപ്ലയർക്ക് ഓർഡർ അയക്കൂ")}
                  </a>
                </>
              )}
            </section>

            <section className="panel p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold">{t("Pattu pending", "കിട്ടാനുള്ള പറ്റ്")}</h2>
                <Link href="/pattu" className="text-sm text-pen font-semibold">{t("Pattu book", "പറ്റ് പുസ്തകം")}</Link>
              </div>
              <p className="sign num text-4xl text-due">{rupees(d.pattu.total)}</p>
              <p className="text-sm text-muted mb-3">{ml ? `${d.pattu.people} പേരിൽ നിന്ന്` : `from ${d.pattu.people} customers`}</p>
              <ul className="space-y-1.5">
                {d.pattu.top.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pattu?c=${p.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 -mx-1 hover:bg-wall">
                      <span className="truncate flex items-center gap-1.5">
                        {p.over && <ShieldAlert size={14} className="text-due shrink-0" aria-label={t("Over pattu limit", "പറ്റ് പരിധി കഴിഞ്ഞു")} />}
                        {p.nameMl ?? p.name} {p.days > 7 && <span className="text-xs text-warn">· {daysLabel(p.days, ml)}</span>}
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
  const { t, ml } = useLang();
  const list = by === "sales" ? d.top.map((t) => ({ ...t, value: t.revenue })) : d.topProfit.map((t) => ({ ...t, value: t.profit }));
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">{t("This week's best", "ഈ ആഴ്ചയിലെ മികച്ചവ")}</h2>
        <div className="flex rounded-md bg-wall p-0.5 text-xs font-semibold" role="radiogroup" aria-label={t("Rank by", "ക്രമം")}>
          {(["sales", "profit"] as const).map((k) => (
            <button key={k} role="radio" aria-checked={by === k} onClick={() => setBy(k)} className={clsx("rounded px-2 py-1", by === k ? "bg-paper text-ink" : "text-muted")}>
              {k === "sales" ? t("Sales", "വിൽപ്പന") : t("Profit", "ലാഭം")}
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
        {list.length === 0 && <li className="text-sm text-muted">{t("Scan a supplier bill to see profit per item.", "ഓരോ സാധനത്തിന്റെയും ലാഭം കാണാൻ ഒരു സപ്ലയർ ബിൽ സ്കാൻ ചെയ്യൂ.")}</li>}
      </ol>
      {d.week.margin !== null && (
        <p className="mt-3 text-sm text-muted">
          {ml ? (
            <>ഈ ആഴ്ച: <b className="num text-ink">{rupees(d.week.sales)}</b> വിൽപ്പന, ഏകദേശം <b className="num text-leaf">{rupees(d.week.profit)}</b> ലാഭം ({d.week.margin}%)</>
          ) : (
            <>Week: <b className="num text-ink">{rupees(d.week.sales)}</b> sales, about <b className="num text-leaf">{rupees(d.week.profit)}</b> profit ({d.week.margin}%)</>
          )}
        </p>
      )}
      {d.dead.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          {t("Not sold in a week:", "ഒരാഴ്ചയായി വിറ്റിട്ടില്ല:")} <span className="text-ink">{d.dead.map((f) => f.product.nameMl).join(", ")}</span>
        </p>
      )}
    </section>
  );
}

/** End of day: does the cash drawer match the books? */
function DayClose({ cash, collected, upi }: { cash: number; collected: number; upi: number }) {
  const [opening, setOpening] = useState("");
  const { t, ml } = useLang();
  const [counted, setCounted] = useState("");
  const expected = Math.round((Number(opening) || 0) + cash + collected);
  const diff = counted === "" ? null : Math.round(Number(counted) - expected);
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={18} className="text-pen" />
        <h2 className="text-lg font-semibold">{t("Close the day", "ദിവസം അടയ്ക്കാം")}</h2>
      </div>
      <p className="text-sm text-muted">{t("Count the cash drawer. Kanakku tells you if anything is missing.", "ക്യാഷ് എണ്ണി നോക്കൂ. എന്തെങ്കിലും കുറവുണ്ടെങ്കിൽ കണക്ക് പറയും.")}</p>
      <dl className="mt-3 space-y-1 text-[0.95rem]">
        <div className="flex justify-between"><dt className="text-muted">{t("Cash sales", "ക്യാഷ് വിൽപ്പന")}</dt><dd className="num">{rupees(cash)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{t("Pattu paid back in cash", "പറ്റ് തിരിച്ചു കിട്ടിയ ക്യാഷ്")}</dt><dd className="num">{rupees(collected)}</dd></div>
        <div className="flex justify-between text-faint"><dt>{t("UPI (already in bank)", "UPI (ബാങ്കിൽ എത്തി)")}</dt><dd className="num">{rupees(upi)}</dd></div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">{t("Opening cash", "രാവിലത്തെ ക്യാഷ്")}
          <input type="number" inputMode="decimal" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="₹0" className="num mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-[0.95rem] text-ink" />
        </label>
        <label className="text-xs text-muted">{t("Cash counted now", "ഇപ്പോൾ എണ്ണിയ ക്യാഷ്")}
          <input type="number" inputMode="decimal" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={`₹${expected}`} className="num mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-[0.95rem] text-ink" />
        </label>
      </div>
      <p className="mt-3 text-sm">{t("Should be", "ഉണ്ടാകേണ്ടത്")} <b className="num">{rupees(expected)}</b></p>
      {diff !== null && (
        <p className={clsx("mt-2 rounded-lg px-3 py-2 text-sm font-semibold slip-in", Math.abs(diff) < 10 ? "bg-leaf-soft text-leaf" : diff < 0 ? "bg-due-soft text-due" : "bg-warn-soft text-warn")}>
          {Math.abs(diff) < 10
            ? t("✓ Drawer matches the books.", "✓ ക്യാഷും കണക്കും ഒത്തു.")
            : diff < 0
              ? ml ? `${rupees(-diff)} കുറവ്. ഒരു വിൽപ്പന ബിൽ ചെയ്യാതെ പോയതാകാം, അല്ലെങ്കിൽ ബാക്കി കൊടുത്തതിൽ തെറ്റ്.` : `${rupees(-diff)} short. A sale may not be billed, or change was given wrong.`
              : ml ? `${rupees(diff)} കൂടുതൽ. ഒരു ബിൽ വിട്ടുപോയതാകാം, അല്ലെങ്കിൽ രണ്ടു തവണ ചേർത്തതാകാം.` : `${rupees(diff)} extra. A bill may have been missed or entered twice.`}
        </p>
      )}
    </section>
  );
}
