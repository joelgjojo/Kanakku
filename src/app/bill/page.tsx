"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Mic, Plus, Search, Send, Square, Trash2 } from "lucide-react";
import { api, waLink } from "@/lib/client";
import { qtyLabel, rupees, unitLabel } from "@/lib/format";
import type { Bill, BillItem, ParsedMessage, PaymentMode, Product } from "@/lib/types";
import type { Balance } from "@/lib/kanakku";
import { useRecorder } from "@/components/useRecorder";
import { enqueueBill, newBillId } from "@/components/OfflineSync";
import { Button, ErrorNote, PageHeader, Segmented, inputCls } from "@/components/ui";
import { trustLabel, trustReason, useLang } from "@/lib/i18n";

const EXAMPLES = ["രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്", "2 kg ari, 1 soap, 6 mutta", "അര കിലോ പരിപ്പും ഒരു സോപ്പും gpay", "Rajan ko 2 kilo cheeni udhaar"];

const round2 = (n: number) => Math.round(n * 100) / 100;

function mergeItems(a: BillItem[], b: BillItem[]) {
  const out = a.map((x) => ({ ...x }));
  for (const i of b) {
    const same = i.productId && out.find((x) => x.productId === i.productId && x.price === i.price);
    if (same) { same.qty = round2(same.qty + i.qty); same.total = round2(same.qty * same.price); }
    else out.push(i);
  }
  return out;
}

export default function NewBill() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Balance[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<{ transcript: string; engine: ParsedMessage["engine"]; via: "voice" | "text" } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ bill: Bill | null; due: number | null; offline?: boolean } | null>(null);
  const [q, setQ] = useState("");
  const billRef = useRef<HTMLElement>(null);
  const { t, ml } = useLang();

  useEffect(() => {
    api<{ products: Product[] }>("/api/products").then((r) => setProducts(r.products)).catch(() => {});
    api<Balance[]>("/api/customers").then(setCustomers).catch(() => {});
  }, []);

  const applyParse = useCallback((r: { parsed: ParsedMessage; items: BillItem[] }, via: "voice" | "text") => {
    setHeard({ transcript: r.parsed.transcript, engine: r.parsed.engine, via });
    if (r.parsed.intent !== "sale" || !r.items.length) {
      setError(r.parsed.intent === "payment" || r.parsed.intent === "restock"
        ? t("That sounds like a payment or stock delivery. Use the Pattu book or Stock page, or send it to the WhatsApp bot.", "ഇത് പറ്റ് അടച്ചതോ സ്റ്റോക്ക് വന്നതോ ആണെന്ന് തോന്നുന്നു. പറ്റ് പുസ്തകമോ സ്റ്റോക്ക് പേജോ ഉപയോഗിക്കൂ, അല്ലെങ്കിൽ വാട്സ്ആപ്പ് ബോട്ടിന് അയക്കൂ.")
        : t("Couldn't find any items in that. Try again, naming the item and quantity.", "സാധനങ്ങൾ മനസ്സിലായില്ല. സാധനത്തിന്റെ പേരും അളവും പറഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ."));
      return;
    }
    setItems((cur) => mergeItems(cur, r.items));
    // On a phone the bill sits below the mic: bring it into view.
    if (window.innerWidth < 1024) setTimeout(() => billRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    if (r.parsed.customerName) setCustomer(r.parsed.customerName);
    if (r.parsed.paymentMode !== "cash") setMode(r.parsed.paymentMode);
  }, [t]);

  const parse = useCallback(async (form: FormData) => {
    setParsing(true);
    setError(null);
    setSaved(null);
    try {
      applyParse(await api("/api/ai/parse", { method: "POST", body: form }), form.has("audio") ? "voice" : "text");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }, [applyParse]);

  const rec = useRecorder(async (wav) => {
    const f = new FormData();
    f.append("audio", wav, "voice.wav");
    await parse(f);
  });

  const sendText = (t = text) => {
    if (!t.trim()) return;
    const f = new FormData();
    f.append("text", t);
    setText("");
    parse(f);
  };

  const addProduct = (p: Product) => {
    setSaved(null);
    const step = p.unit === "pc" ? 1 : 1;
    setItems((cur) => mergeItems(cur, [{ productId: p.id, name: p.name, nameMl: p.nameMl, qty: step, unit: p.unit, price: p.price, total: p.price * step }]));
  };

  const update = (idx: number, patch: Partial<BillItem>) =>
    setItems((cur) => cur.map((x, i) => (i === idx ? { ...x, ...patch, total: round2((patch.qty ?? x.qty) * (patch.price ?? x.price)) } : x)));

  const total = round2(items.reduce((s, i) => s + i.qty * i.price, 0));
  const customerMatch = customers.find((c) => c.customer.name.toLowerCase() === customer.trim().toLowerCase());

  const save = async () => {
    setError(null);
    if (mode === "credit" && !customer.trim()) return setError(t("Pattu needs a customer name.", "പറ്റിന് ആളുടെ പേര് വേണം."));
    const body = {
      id: newBillId(),
      items: items.filter((i) => i.qty > 0),
      customerName: customer.trim() || null,
      paymentMode: mode,
      source: heard?.via ?? "manual",
      rawInput: heard?.transcript,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    try {
      const r = await api<{ bill: Bill; due: number | null }>("/api/bills", { json: body });
      setSaved(r);
      reset();
      api<Balance[]>("/api/customers").then(setCustomers).catch(() => {});
    } catch (e) {
      // No answer from the server (offline or the connection dropped): keep the bill on the phone.
      // It carries its own id, so if the server did save it, the retry won't add it twice.
      if (!navigator.onLine || /fetch|network|load failed/i.test((e as Error).message)) {
        enqueueBill(body);
        setSaved({ bill: null, due: null, offline: true });
        reset();
      } else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setItems([]); setCustomer(""); setMode("cash"); setHeard(null); };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) => [p.name, p.nameMl, ...p.aliases].some((n) => n.toLowerCase().includes(s)));
  }, [products, q]);

  const receipt = saved?.bill
    ? `${saved.bill.customerName ? `Hi ${saved.bill.customerName}, ` : ""}your bill from ${process.env.NEXT_PUBLIC_SHOP_NAME ?? "Ammu Stores"} 🧾\n${saved.bill.items.map((i) => `${i.nameMl ?? i.name} ${qtyLabel(i.qty, i.unit)} = ${rupees(i.total)}`).join("\n")}\nTotal: ${rupees(saved.bill.total)}${saved.bill.paymentMode === "credit" && saved.due !== null ? `\nPattu balance: ${rupees(saved.due)}` : ""}\nNanni! 🙏`
    : "";
  const receiptPhone = saved?.bill?.customerId ? customers.find((c) => c.customer.id === saved.bill!.customerId)?.customer.phone : undefined;

  return (
    <>
      <PageHeader title="New bill" titleMl="പുതിയ ബിൽ" ml="പറഞ്ഞാൽ മതി, ബിൽ റെഡി" />
      <div className="px-4 lg:px-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        {/* Capture */}
        <section className="space-y-4 lg:col-start-1 lg:row-start-1">
          <div className="panel p-5 flex flex-col items-center text-center">
            <button
              onClick={rec.toggle}
              disabled={rec.state === "processing" || parsing}
              aria-label={rec.state === "recording" ? t("Stop recording", "നിർത്തുക") : t("Start speaking", "പറഞ്ഞു തുടങ്ങൂ")}
              className={clsx(
                "grid place-items-center size-32 rounded-full transition-colors disabled:opacity-60",
                rec.state === "recording" ? "bg-margin text-white recording" : "bg-sign text-ink hover:bg-[#f7cf4f]",
              )}
            >
              {rec.state === "recording" ? <Square size={38} fill="currentColor" /> : <Mic size={46} strokeWidth={2.2} />}
            </button>
            <p className="mt-4 text-lg font-semibold">
              {rec.state === "recording"
                ? t(`Listening… ${rec.seconds}s. Tap to finish.`, `കേൾക്കുന്നു… ${rec.seconds}s. നിർത്താൻ തൊടൂ.`)
                : parsing || rec.state === "processing" ? t("Writing the bill…", "ബിൽ എഴുതുന്നു…") : t("Tap and say the bill", "തൊട്ടിട്ട് ബിൽ പറയൂ")}
            </p>
            <p className="text-muted text-sm">{t("Malayalam, Manglish, English or Hindi", "മലയാളം, മംഗ്ലീഷ്, ഇംഗ്ലീഷ്, ഹിന്ദി")}</p>
            {rec.error && <div className="mt-3 w-full"><ErrorNote>{rec.error}</ErrorNote></div>}

            <form className="mt-5 flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Or type: 2 kg ari, 1 soap", "അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യൂ: 2 കിലോ അരി, 1 സോപ്പ്")} className={inputCls} aria-label={t("Type the bill", "ബിൽ ടൈപ്പ് ചെയ്യൂ")} />
              <Button type="submit" variant="outline" disabled={!text.trim() || parsing}>{t("Add", "ചേർക്കൂ")}</Button>
            </form>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => sendText(ex)} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink hover:bg-wall">
                  {ex}
                </button>
              ))}
            </div>
          </div>

        </section>

        {/* The bill, written on a notebook page */}
        <section ref={billRef} className="scroll-mt-16 space-y-3 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          {saved && (
            <div className="panel slip-in p-4 border-leaf/40 bg-leaf-soft">
              <p className="font-semibold text-leaf flex items-center gap-2"><Check size={18} />
                {saved.offline
                  ? t("Saved on this phone. It will sync when the internet is back.", "ഈ ഫോണിൽ സേവ് ചെയ്തു. നെറ്റ് വന്നാൽ തനിയെ സിങ്ക് ആകും.")
                  : t(`Bill #${saved.bill!.number} saved: ${rupees(saved.bill!.total)}`, `ബിൽ #${saved.bill!.number} സേവ് ചെയ്തു: ${rupees(saved.bill!.total)}`)}
              </p>
              {saved.bill && (saved.bill as Bill & { added?: Product[] }).added?.length ? (
                <p className="text-sm mt-1">
                  🆕 {t("Added to your stock list:", "സ്റ്റോക്ക് ലിസ്റ്റിൽ ചേർത്തു:")}{" "}
                  {(saved.bill as Bill & { added: Product[] }).added.map((p) => `${ml ? p.nameMl : p.name} ${rupees(p.price)}/${p.unit}`).join(", ")}
                  {t(". Check the price on the Stock page.", ". വില സ്റ്റോക്ക് പേജിൽ നോക്കൂ.")}
                </p>
              ) : null}
              {saved.bill?.paymentMode === "credit" && saved.due !== null && (
                <p className="text-sm mt-1">{ml ? `${saved.bill.customerName}-ന്റെ പറ്റ് ഇപ്പോൾ ` : `${saved.bill.customerName}'s pattu is now `}<b className="text-due num">{rupees(saved.due)}</b></p>
              )}
              {saved.bill && (
                <a href={waLink(receiptPhone, receipt)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 h-9 rounded-lg bg-paper border border-line px-3 text-sm font-semibold hover:bg-wall">
                  <Send size={15} /> {t("Send receipt on WhatsApp", "വാട്സ്ആപ്പിൽ രസീത് അയക്കൂ")}
                </a>
              )}
            </div>
          )}

          <div className="panel overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("Bill", "ബിൽ")}</h2>
              {heard && (
                <p className="min-w-0 text-sm text-muted truncate" title={heard.transcript}>
                  {t("Heard:", "കേട്ടത്:")} <span className="text-ink">“{heard.transcript}”</span>
                </p>
              )}
            </div>
            <div className="ledger">
              {items.length === 0 && (
                <p className="ledger-row pl-14 pr-4 text-faint">{t("Speak, type or tap items. They appear here.", "പറയൂ, ടൈപ്പ് ചെയ്യൂ, അല്ലെങ്കിൽ സാധനം തൊടൂ. ഇവിടെ വരും.")}</p>
              )}
              {items.map((it, i) => (
                <div key={i} className="ledger-row gap-2 pr-3 slip-in">
                  <span className="w-11 shrink-0 text-center text-sm text-faint num">{i + 1}</span>
                  <span className="flex-1 min-w-0 leading-tight">
                    <span className="block truncate font-semibold text-pen-dark">{it.nameMl ?? it.name}</span>
                    {(it.nameMl || !it.productId) && <span className="block truncate text-xs text-muted">{it.name}{!it.productId && <span className="text-warn">{t(" · new: added to stock on save", " · പുതിയത്: സ്റ്റോക്കിൽ ചേർക്കും")}</span>}</span>}
                  </span>
                  <label className="flex items-center gap-1 text-sm">
                    <span className="sr-only">{t("Quantity", "അളവ്")}</span>
                    <input type="number" inputMode="decimal" step="any" min={0} value={it.qty}
                      onChange={(e) => update(i, { qty: Number(e.target.value) })}
                      className="num w-14 h-8 rounded-md border border-line bg-paper/80 px-1.5 text-right" />
                    <span className="w-6 text-muted">{unitLabel[it.unit]}</span>
                  </label>
                  <label className="hidden sm:flex items-center text-sm text-muted">
                    <span className="sr-only">Price per {it.unit}</span>×
                    <input type="number" inputMode="decimal" step="any" min={0} value={it.price}
                      onChange={(e) => update(i, { price: Number(e.target.value) })}
                      className="num w-16 h-8 ml-1 rounded-md border border-line bg-paper/80 px-1.5 text-right text-ink" />
                  </label>
                  <span className="num w-20 text-right font-semibold text-pen-dark">{rupees(it.qty * it.price)}</span>
                  <button onClick={() => setItems((c) => c.filter((_, j) => j !== i))} aria-label={t(`Remove ${it.name}`, `${it.nameMl ?? it.name} മാറ്റുക`)} className="p-1.5 rounded-md text-faint hover:text-due hover:bg-due-soft">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 5 - Math.max(1, items.length)) }).map((_, i) => <div key={`blank-${i}`} className="ledger-row" aria-hidden />)}
              <div className="ledger-row pl-14 pr-3 border-t-2 border-ink/70 justify-between">
                <span className="font-semibold">ആകെ · Total</span>
                <span className="num sign text-3xl">{rupees(total)}</span>
              </div>
            </div>

            <div className="p-5 space-y-4 border-t border-line">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-muted">{t("Customer", "ആൾ")} {mode === "credit" ? t("(needed for pattu)", "(പറ്റിന് വേണം)") : t("(optional)", "(വേണമെങ്കിൽ)")}</span>
                  <input list="customers" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={t("Name", "പേര്")} className={clsx(inputCls, "mt-1")} />
                  <datalist id="customers">{customers.map((c) => <option key={c.customer.id} value={c.customer.name}>{c.customer.nameMl}</option>)}</datalist>
                  {customerMatch && (customerMatch.due > 0 || mode === "credit") && (
                    <span className="block text-xs text-muted mt-1">
                      {t("Pattu already", "ഇപ്പോഴുള്ള പറ്റ്")} <b className="text-due num">{rupees(Math.max(0, customerMatch.due))}</b>
                      {" "}· {trustLabel(customerMatch.trust.label, ml)} · {t("limit", "പരിധി")} <span className="num">{rupees(customerMatch.trust.limit)}</span>
                    </span>
                  )}
                  {customerMatch && mode === "credit" && customerMatch.due + total > customerMatch.trust.limit && (
                    <span className="block mt-1 rounded-md bg-due-soft px-2 py-1 text-xs text-due">
                      {ml
                        ? `ഇതോടെ ${customerMatch.customer.nameMl ?? customerMatch.customer.name}-ന്റെ പറ്റ് ${rupees(customerMatch.due + total)} ആകും, പരിധി കഴിയും. `
                        : `This takes ${customerMatch.customer.name} to ${rupees(customerMatch.due + total)}, over the limit. `}
                      {trustReason(customerMatch, ml)}
                    </span>
                  )}
                </label>
                <div>
                  <span className="text-sm text-muted block mb-1">{t("Paid by", "പണം")}</span>
                  <Segmented label={t("Paid by", "പണം")} value={mode} onChange={setMode}
                    options={[{ value: "cash", label: t("Cash", "ക്യാഷ്") }, { value: "upi", label: "UPI" }, { value: "credit", label: t("Pattu", "പറ്റ്"), tone: "due" }]} />
                </div>
              </div>
              <ErrorNote>{error}</ErrorNote>
              <div className="flex gap-2">
                <Button onClick={save} busy={saving} disabled={!items.length} className="flex-1 h-12 text-base">
                  <Plus size={18} /> {t("Save bill", "ബിൽ സേവ് ചെയ്യൂ")} {items.length > 0 && <span className="num">· {rupees(total)}</span>}
                </Button>
                {items.length > 0 && <Button variant="outline" className="h-12" onClick={reset}>{t("Clear", "മായ്ക്കൂ")}</Button>}
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-start-1 lg:row-start-2">
          <div className="panel p-4">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find an item to tap in", "സാധനം തിരയൂ")} className={clsx(inputCls, "pl-9")} aria-label={t("Search items", "സാധനം തിരയൂ")} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
              {shown.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="text-left rounded-lg border border-line px-3 py-2 hover:border-pen hover:bg-pen-soft"
                >
                  <span className="block font-semibold leading-tight truncate">{p.nameMl}</span>
                  <span className="flex justify-between text-xs text-muted mt-0.5">
                    <span className="truncate">{p.name}</span>
                    <span className="num whitespace-nowrap">{rupees(p.price)}/{unitLabel[p.unit]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
