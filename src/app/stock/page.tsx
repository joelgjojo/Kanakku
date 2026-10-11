"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Plus, Receipt, RotateCcw, ScanSearch, Truck } from "lucide-react";
import { api, waLink } from "@/lib/client";
import { qtyLabel, rupees, unitLabel } from "@/lib/format";
import type { Forecast } from "@/lib/analytics";
import type { Product, Unit } from "@/lib/types";
import { Button, ErrorNote, PageHeader, Segmented, Spinner, inputCls } from "@/components/ui";
import { useLang } from "@/lib/i18n";

type Filter = "all" | "restock" | "dead";

const STATUS: Record<Forecast["status"], { label: string; ml: string; cls: string }> = {
  out: { label: "Out of stock", ml: "തീർന്നു", cls: "bg-due-soft text-due" },
  critical: { label: "Runs out soon", ml: "ഉടൻ തീരും", cls: "bg-due-soft text-due" },
  low: { label: "Low", ml: "കുറവ്", cls: "bg-warn-soft text-warn" },
  ok: { label: "Fine", ml: "ശരി", cls: "bg-leaf-soft text-leaf" },
  dead: { label: "Not selling", ml: "വിൽക്കുന്നില്ല", cls: "bg-wall text-muted" },
};

const CATEGORY_ML: Record<string, string> = {
  Grains: "ധാന്യം", Grocery: "പലചരക്ക്", Oil: "എണ്ണ", Beverages: "പാനീയം", Dairy: "പാലും മുട്ടയും", "Personal care": "ശുചിത്വം",
  Spices: "മസാല", Pulses: "പയർ", Vegetables: "പച്ചക്കറി", Snacks: "പലഹാരം", Household: "വീട്ടുസാധനം",
};

export default function Stock() {
  const [rows, setRows] = useState<Forecast[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { t, ml } = useLang();

  const load = useCallback(() => api<{ forecast: Forecast[] }>("/api/products").then((r) => setRows(r.forecast)), []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? [])
    .filter((f) => filter === "all" || (filter === "restock" ? ["out", "critical", "low"].includes(f.status) : f.status === "dead"))
    .sort((a, b) => (filter === "all" ? a.product.category.localeCompare(b.product.category) || a.product.name.localeCompare(b.product.name) : 0));
  const restock = (rows ?? []).filter((f) => ["out", "critical", "low"].includes(f.status));
  const order = `Hi, please send:\n${restock.map((f) => `• ${f.product.name} (${f.product.nameMl}) – ${f.reorderQty} ${f.product.unit}`).join("\n")}`;
  const value = (rows ?? []).reduce((s, f) => s + f.product.stock * f.product.price, 0);

  return (
    <>
      <PageHeader title="Stock" titleMl="സ്റ്റോക്ക്" ml="സ്റ്റോക്ക്">
        <Link href="/purchase" className="inline-flex items-center gap-2 h-10 rounded-lg border border-line bg-paper px-3 text-sm font-semibold hover:bg-wall"><Receipt size={16} />{t("Supplier bill", "സപ്ലയർ ബിൽ")}</Link>
        <Link href="/shelf" className="inline-flex items-center gap-2 h-10 rounded-lg border border-line bg-paper px-3 text-sm font-semibold hover:bg-wall"><ScanSearch size={16} />{t("Check a shelf", "ഷെൽഫ് പരിശോധിക്കൂ")}</Link>
        <Button onClick={() => setAdding((a) => !a)}><Plus size={16} />{t("Add item", "സാധനം ചേർക്കൂ")}</Button>
      </PageHeader>

      <div className="px-4 lg:px-8 space-y-4">
        {adding && <ProductForm onDone={() => { setAdding(false); load(); }} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Filter> label={t("Show", "കാണിക്കൂ")} value={filter} onChange={setFilter}
            options={[{ value: "all", label: t("All items", "എല്ലാം") }, { value: "restock", label: `${t("Needs restock", "വാങ്ങേണ്ടവ")} (${restock.length})` }, { value: "dead", label: t("Not selling", "വിൽക്കാത്തവ") }]} />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{t("Stock value", "സ്റ്റോക്കിന്റെ വില")} <b className="num text-ink">{rupees(Math.round(value))}</b></span>
            {restock.length > 0 && (
              <a href={waLink(process.env.NEXT_PUBLIC_SUPPLIER_PHONE, order)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-line bg-paper px-3 font-semibold hover:bg-wall">
                <Truck size={15} />{ml ? `${restock.length} സാധനം ഓർഡർ ചെയ്യൂ` : `Order ${restock.length} items`}
              </a>
            )}
          </div>
        </div>

        <section className="panel overflow-hidden">
          {!rows ? <div className="p-5"><Spinner /></div> : (
            <>
              <div className="hidden md:grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.7fr_1fr_6rem] gap-3 px-5 py-2.5 text-xs text-muted border-b border-line">
                <span>{t("Item", "സാധനം")}</span><span className="text-right">{t("In stock", "സ്റ്റോക്ക്")}</span><span className="text-right">{t("Sells a day", "ദിവസം വിൽപ്പന")}</span><span className="text-right">{t("Lasts", "തീരാൻ")}</span><span className="text-right">{t("Margin", "ലാഭം %")}</span><span>{t("Status", "നില")}</span><span />
              </div>
              <ul className="divide-y divide-line">
                {shown.map((f) => (
                  <li key={f.product.id}>
                    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.7fr_1fr_6rem] items-center gap-x-3 gap-y-1 px-5 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{f.product.nameMl} <span className="font-normal text-sm text-muted">{f.product.name}</span></p>
                        <p className="text-xs text-muted num">{rupees(f.product.price)} {t("per", "/")} {unitLabel[f.product.unit]}{f.product.costPrice ? ` · ${t("cost", "വാങ്ങിയ വില")} ${rupees(f.product.costPrice)}` : ""} · {ml ? CATEGORY_ML[f.product.category] ?? f.product.category : f.product.category}</p>
                      </div>
                      <p className="num text-right font-semibold">{qtyLabel(f.product.stock, f.product.unit)}</p>
                      <p className="num text-right text-muted hidden md:block">{f.perDay ? `${f.perDay} ${unitLabel[f.product.unit]}` : "-"}</p>
                      <p className="num text-right hidden md:block">{f.daysLeft === null ? "-" : f.daysLeft >= 30 ? t("30+ days", "30+ ദിവസം") : `${f.daysLeft} ${t("days", "ദിവസം")}`}</p>
                      <p className={clsx("num text-right hidden md:block", f.margin === null ? "text-faint" : f.margin < 5 ? "text-due font-semibold" : "text-leaf")} title={f.product.costPrice ? `${t("Cost", "വാങ്ങിയ വില")} ${rupees(f.product.costPrice)}` : t("Scan a supplier bill to learn the cost", "വാങ്ങിയ വില അറിയാൻ സപ്ലയർ ബിൽ സ്കാൻ ചെയ്യൂ")}>
                        {f.margin === null ? "-" : `${f.margin}%`}
                      </p>
                      <p className="col-span-2 md:col-span-1 flex items-center gap-2">
                        <span className={clsx("rounded-md px-2 py-0.5 text-xs font-semibold", STATUS[f.status].cls)}>{ml ? STATUS[f.status].ml : STATUS[f.status].label}</span>
                        <span className="md:hidden text-xs text-muted num">{f.daysLeft !== null && f.daysLeft < 30 ? (ml ? `${f.daysLeft} ദിവസത്തേക്ക്` : `lasts ${f.daysLeft} days`) : ""}</span>
                      </p>
                      <button onClick={() => setOpenId(openId === f.product.id ? null : f.product.id)} className="hidden md:block text-sm font-semibold text-pen justify-self-end">
                        {openId === f.product.id ? t("Close", "അടയ്ക്കൂ") : t("Update", "മാറ്റം")}
                      </button>
                      <button onClick={() => setOpenId(openId === f.product.id ? null : f.product.id)} className="md:hidden col-span-2 text-left text-sm font-semibold text-pen">
                        {openId === f.product.id ? t("Close", "അടയ്ക്കൂ") : t("Update stock or price", "സ്റ്റോക്കോ വിലയോ മാറ്റൂ")}
                      </button>
                    </div>
                    {openId === f.product.id && <StockEditor f={f} onDone={() => { setOpenId(null); load(); }} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <ResetDemo onDone={load} />
      </div>
    </>
  );
}

function StockEditor({ f, onDone }: { f: Forecast; onDone: () => void }) {
  const [arrived, setArrived] = useState(String(f.reorderQty));
  const [price, setPrice] = useState(String(f.product.price));
  const [low, setLow] = useState(String(f.product.lowStockAt));
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useLang();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="bg-wall px-5 py-4 grid gap-4 md:grid-cols-3">
      <form onSubmit={(e) => { e.preventDefault(); run(() => api("/api/stock", { json: { productId: f.product.id, qty: Number(arrived) } })); }}>
        <p className="text-sm font-semibold mb-1.5">{t("Stock arrived", "സ്റ്റോക്ക് വന്നു")}</p>
        <div className="flex gap-2">
          <input type="number" step="any" min={0} value={arrived} onChange={(e) => setArrived(e.target.value)} className={inputCls} aria-label={`Quantity arrived in ${f.product.unit}`} />
          <Button type="submit" busy={busy}>+ {unitLabel[f.product.unit]}</Button>
        </div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); run(() => api("/api/stock", { json: { productId: f.product.id, setTo: Number(count), reason: "audit" } })); }}>
        <p className="text-sm font-semibold mb-1.5">{t("I counted it, the real stock is", "എണ്ണി നോക്കി, ശരിക്കുള്ള സ്റ്റോക്ക്")}</p>
        <div className="flex gap-2">
          <input type="number" step="any" min={0} value={count} onChange={(e) => setCount(e.target.value)} placeholder={String(f.product.stock)} className={inputCls} aria-label="Counted stock" />
          <Button type="submit" variant="outline" busy={busy} disabled={count === ""}>{t("Set", "ശരിയാക്കൂ")}</Button>
        </div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); run(() => api("/api/products", { json: { ...f.product, price: Number(price), lowStockAt: Number(low) } })); }}>
        <p className="text-sm font-semibold mb-1.5">{t("Price and low-stock alert", "വിലയും കുറവ് അലേർട്ടും")}</p>
        <div className="flex gap-2">
          <input type="number" step="any" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} aria-label="Price" />
          <input type="number" step="any" min={0} value={low} onChange={(e) => setLow(e.target.value)} className={inputCls} aria-label="Alert below" />
          <Button type="submit" variant="outline" busy={busy}>{t("Save", "സേവ്")}</Button>
        </div>
      </form>
      {err && <div className="md:col-span-3"><ErrorNote>{err}</ErrorNote></div>}
    </div>
  );
}

function ProductForm({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState<Partial<Product>>({ unit: "pc", category: "Grocery" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Product) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="panel p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
          await api("/api/products", { json: { ...p, aliases: String(p.aliases ?? "").split(",").map((s) => s.trim()).filter(Boolean) } });
          onDone();
        } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}
    >
      <input required placeholder="Name (English)" onChange={set("name")} className={inputCls} />
      <input placeholder="പേര് (Malayalam)" onChange={set("nameMl")} className={inputCls} />
      <input placeholder="Other names, comma separated" onChange={set("aliases")} className={inputCls} />
      <input placeholder="Category" defaultValue="Grocery" onChange={set("category")} className={inputCls} />
      <select value={p.unit} onChange={set("unit")} className={inputCls} aria-label="Unit">
        {(["kg", "l", "pc", "pkt"] as Unit[]).map((u) => <option key={u} value={u}>Sold per {unitLabel[u]}</option>)}
      </select>
      <input required type="number" step="any" min={0} placeholder="Price ₹" onChange={set("price")} className={inputCls} />
      <input type="number" step="any" min={0} placeholder="Stock now" onChange={set("stock")} className={inputCls} />
      <input type="number" step="any" min={0} placeholder="Alert below" onChange={set("lowStockAt")} className={inputCls} />
      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
        <Button type="submit" busy={busy}>Add item</Button>
        <ErrorNote>{err}</ErrorNote>
      </div>
    </form>
  );
}

function ResetDemo({ onDone }: { onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4 text-sm text-muted">
      <RotateCcw size={15} />
      <span>Demo shop data</span>
      {!sure ? (
        <button onClick={() => setSure(true)} className="font-semibold text-pen">Reset to the starting demo</button>
      ) : (
        <>
          <span className="text-ink">This replaces every bill, payment and stock count.</span>
          <Button variant="danger" busy={busy} className="h-8 px-3 text-sm" onClick={async () => {
            setBusy(true);
            await api("/api/reset", { method: "POST" }).catch(() => {});
            setBusy(false); setSure(false); onDone();
          }}>Reset demo data</Button>
          <button onClick={() => setSure(false)} className="font-semibold">Keep my data</button>
        </>
      )}
    </div>
  );
}
