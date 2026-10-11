"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Check, ImagePlus } from "lucide-react";
import { api, compressImage } from "@/lib/client";
import { qtyLabel, rupees, unitLabel } from "@/lib/format";
import type { PurchaseLine } from "@/lib/types";
import type { PurchaseOutcome } from "@/lib/kanakku";
import { useLang } from "@/lib/i18n";
import { Button, ErrorNote, PageHeader, Spinner } from "@/components/ui";

type Line = PurchaseLine & { sellPrice: number | null; oldCost: number | null; keep: boolean };

const marginOf = (sell: number | null, cost: number) => (sell && cost ? Math.round(((sell - cost) / sell) * 1000) / 10 : null);

export default function Purchase() {
  const { t, ml } = useLang();
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [meta, setMeta] = useState<{ supplier: string | null; invoiceTotal: number | null }>({ supplier: null, invoiceTotal: null });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<PurchaseOutcome[] | null>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setErr(null); setLines(null); setDone(null);
    const small = await compressImage(f);
    setBlob(small);
    setPreview(URL.createObjectURL(small));
  };

  const read = async () => {
    if (!blob) return;
    setReading(true); setErr(null);
    try {
      const form = new FormData();
      form.append("image", blob, "bill.jpg");
      const r = await api<{ supplier: string | null; invoiceTotal: number | null; items: (PurchaseLine & { sellPrice: number | null; oldCost: number | null })[] }>("/api/ai/purchase", { method: "POST", body: form });
      setMeta({ supplier: r.supplier, invoiceTotal: r.invoiceTotal });
      setLines(r.items.map((i) => ({ ...i, keep: true })));
    } catch (e) { setErr((e as Error).message); } finally { setReading(false); }
  };

  const edit = (i: number, patch: Partial<Line>) => setLines((c) => c!.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await api<{ done: PurchaseOutcome[] }>("/api/purchase/import", { json: { items: lines!.filter((l) => l.keep) } });
      setDone(r.done);
      setLines(null); setPreview(null); setBlob(null);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const kept = lines?.filter((l) => l.keep) ?? [];
  const sum = kept.reduce((s, l) => s + l.qty * l.unitCost, 0);

  return (
    <>
      <PageHeader title="Supplier bill" titleMl="സപ്ലയർ ബിൽ" ml="ബിൽ ഫോട്ടോ എടുത്താൽ സ്റ്റോക്കും ലാഭവും റെഡി" />
      <div className="px-4 lg:px-8 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-start">
        <section className="panel p-5 space-y-4">
          <p className="text-muted">
            {ml ? (
              <>മൊത്തക്കച്ചവടക്കാരന്റെ ബില്ലിന്റെ ഫോട്ടോ എടുക്കൂ. സ്റ്റോക്ക് ചേർക്കും, ഓരോ സാധനത്തിനും ശരിക്കും എത്ര ചെലവായെന്ന് പഠിക്കും. അങ്ങനെ <b className="text-ink">യഥാർത്ഥ ലാഭം</b> കാണിക്കും.</>
            ) : (
              <>Photograph the bill from your wholesaler. Kanakku adds the stock and learns what each item really costs you, so it can show your <b className="text-ink">real profit</b>.</>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg bg-ink text-paper font-semibold cursor-pointer hover:bg-pen-dark">
              <Camera size={26} />{t("Take photo", "ഫോട്ടോ എടുക്കൂ")}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border border-line font-semibold cursor-pointer hover:bg-wall">
              <ImagePlus size={26} />{t("Choose from gallery", "ഗാലറിയിൽ നിന്ന്")}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          </div>
          {preview && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Supplier bill to read" className="w-full rounded-lg border border-line" />
              {!lines && <Button onClick={read} busy={reading} className="w-full h-12 text-base">{reading ? t("Reading the bill…", "ബിൽ വായിക്കുന്നു…") : t("Read this bill", "ഈ ബിൽ വായിക്കൂ")}</Button>}
            </>
          )}
          <ErrorNote>{err}</ErrorNote>
          <p className="text-sm text-muted">{t("On WhatsApp: send the photo with the caption", "വാട്സ്ആപ്പിൽ: ഫോട്ടോയ്ക്കൊപ്പം ക്യാപ്ഷൻ")} <b className="text-ink">bill</b>.</p>
        </section>

        <section className="min-w-0 space-y-4">
          {reading && <div className="panel p-6 flex items-center gap-3"><Spinner />{t("Reading items, pack sizes and prices…", "സാധനങ്ങളും അളവും വിലയും വായിക്കുന്നു…")}</div>}

          {done && (
            <div className="panel p-5 slip-in">
              <p className="font-semibold text-leaf flex items-center gap-2"><Check size={18} />{ml ? `${done.length} സാധനങ്ങളുടെ സ്റ്റോക്ക് ചേർത്തു` : `Stock added for ${done.length} items`}</p>
              <ul className="mt-3 divide-y divide-line">
                {done.map((d) => (
                  <li key={d.product.id} className="py-2 flex items-center gap-3">
                    <span className="flex-1 min-w-0 truncate">
                      {d.product.nameMl || d.product.name} {d.isNew && <span className="ml-1 rounded bg-sign px-1.5 text-xs font-semibold">New item</span>}
                    </span>
                    <span className="num text-sm text-muted">+{qtyLabel(d.qty, d.product.unit)}</span>
                    <span className={clsx("num text-sm font-semibold w-20 text-right", d.marginPct < 5 ? "text-due" : "text-leaf")}>{d.marginPct}% margin</span>
                  </li>
                ))}
              </ul>
              {done.some((d) => d.marginPct < 5) && <p className="mt-2 text-sm text-due">{t("Very low margin on some items. Check their selling price on the Stock page.", "ചില സാധനങ്ങൾക്ക് ലാഭം വളരെ കുറവാണ്. സ്റ്റോക്ക് പേജിൽ വിൽപ്പന വില നോക്കൂ.")}</p>}
              <Link href="/stock" className="mt-3 inline-block text-pen font-semibold text-sm">See stock and margins</Link>
            </div>
          )}

          {lines && (
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{meta.supplier ?? "Supplier bill"}</h2>
                  <p className="text-sm text-muted num">
                    {kept.length} items · {rupees(Math.round(sum))}{meta.invoiceTotal ? ` (bill says ${rupees(meta.invoiceTotal)})` : ""}
                  </p>
                </div>
                <Button onClick={save} busy={saving} disabled={!kept.length}>{t("Add stock", "സ്റ്റോക്ക് ചേർക്കൂ")}</Button>
              </div>
              <div className="hidden sm:grid grid-cols-[2rem_1fr_5.5rem_6rem_4.5rem] gap-2 px-5 py-2 text-xs text-muted border-y border-line">
                <span /><span>Item</span><span className="text-right">Qty</span><span className="text-right">Cost / unit</span><span className="text-right">Margin</span>
              </div>
              <ul className="divide-y divide-line">
                {lines.map((l, i) => {
                  const m = marginOf(l.sellPrice, l.unitCost);
                  return (
                    <li key={i} className={clsx("grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_5.5rem_6rem_4.5rem] gap-2 items-center px-5 py-2.5", !l.keep && "opacity-45")}>
                      <input type="checkbox" checked={l.keep} onChange={(e) => edit(i, { keep: e.target.checked })} className="size-4 accent-[var(--color-pen)]" aria-label={`Include ${l.name}`} />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{l.nameMl || l.name}</span>
                        <span className="block text-xs text-muted truncate">
                          {l.name}
                          {!l.productId && <span className="ml-1 rounded bg-sign px-1 text-ink">New item</span>}
                          {l.oldCost !== null && l.oldCost !== l.unitCost && <span className={clsx("ml-1", l.unitCost > l.oldCost ? "text-due" : "text-leaf")}>was {rupees(l.oldCost)}</span>}
                        </span>
                      </span>
                      <label className="flex items-center justify-end gap-1 text-sm">
                        <input type="number" step="any" min={0} value={l.qty} onChange={(e) => edit(i, { qty: Number(e.target.value) })} className="num w-14 h-8 rounded-md border border-line px-1.5 text-right" aria-label="Quantity" />
                        <span className="w-6 text-muted">{unitLabel[l.unit]}</span>
                      </label>
                      <label className="hidden sm:flex items-center justify-end text-sm text-muted">₹
                        <input type="number" step="any" min={0} value={l.unitCost} onChange={(e) => edit(i, { unitCost: Number(e.target.value) })} className="num w-16 h-8 ml-1 rounded-md border border-line px-1.5 text-right text-ink" aria-label="Cost per unit" />
                      </label>
                      <span className={clsx("hidden sm:block num text-right text-sm font-semibold", m === null ? "text-faint" : m < 5 ? "text-due" : "text-leaf")}>{m === null ? "new" : `${m}%`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!lines && !reading && !done && (
            <div className="panel p-5 hidden lg:block text-muted">
              <p className="font-semibold text-ink">{t("Why this matters", "ഇത് എന്തിന്")}</p>
              <p className="mt-1">Most small shops don&apos;t know which items actually make money. Once a few supplier bills are in, Kanakku shows profit per item and per day, and warns you when a supplier raises a price.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
