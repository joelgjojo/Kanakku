"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Check, ImagePlus } from "lucide-react";
import { api, compressImage } from "@/lib/client";
import { qtyLabel, rupees } from "@/lib/format";
import type { BillItem, NotebookEntry } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { Button, ErrorNote, PageHeader, Spinner, inputCls } from "@/components/ui";

type Entry = NotebookEntry & { billItems: BillItem[]; keep: boolean };

export default function Notebook() {
  const { t, ml } = useLang();
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [reading, setReading] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ sales: number; payments: number; total: number } | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setEntries(null); setDone(null);
    const small = await compressImage(f);
    setBlob(small);
    setPreview(URL.createObjectURL(small));
  };

  const read = async () => {
    if (!blob) return;
    setReading(true); setErr(null);
    try {
      const form = new FormData();
      form.append("image", blob, "page.jpg");
      const r = await api<{ rawText: string; entries: (NotebookEntry & { billItems: BillItem[] })[] }>("/api/ai/notebook", { method: "POST", body: form });
      setRaw(r.rawText);
      setEntries(r.entries.map((e) => ({ ...e, keep: true })));
    } catch (e) { setErr((e as Error).message); } finally { setReading(false); }
  };

  const edit = (i: number, patch: Partial<Entry>) => setEntries((c) => c!.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      setDone(await api("/api/notebook/import", { json: { entries: entries!.filter((e) => e.keep) } }));
      setEntries(null); setPreview(null); setBlob(null);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const kept = entries?.filter((e) => e.keep) ?? [];

  return (
    <>
      <PageHeader title="Notebook to Kanakku" titleMl="നോട്ട്ബുക്കിൽ നിന്ന് കണക്കിലേക്ക്" ml="ബുക്കിന്റെ ഫോട്ടോ എടുത്താൽ മതി" />
      <div className="px-4 lg:px-8 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-start">
        <section className="panel p-5 space-y-4">
          <p className="text-muted">{t("Take a photo of a page from your sales book or pattu book. Kanakku reads the handwriting and adds every line to your accounts.", "വിൽപ്പന ബുക്കിന്റെയോ പറ്റ് ബുക്കിന്റെയോ ഒരു പേജിന്റെ ഫോട്ടോ എടുക്കൂ. കയ്യക്ഷരം വായിച്ച് ഓരോ വരിയും കണക്ക് ചേർക്കും.")}</p>
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
              <img src={preview} alt="Notebook page to read" className="w-full rounded-lg border border-line" />
              {!entries && <Button onClick={read} busy={reading} className="w-full h-12 text-base">{reading ? t("Reading the handwriting…", "കയ്യക്ഷരം വായിക്കുന്നു…") : t("Read this page", "ഈ പേജ് വായിക്കൂ")}</Button>}
            </>
          )}
          <ErrorNote>{err}</ErrorNote>
          {done && (
            <div className="rounded-lg bg-leaf-soft p-4 text-leaf slip-in">
              <p className="font-semibold flex items-center gap-2"><Check size={18} />{ml ? `${done.sales} വിൽപ്പന (${rupees(done.total)}), ${done.payments} പറ്റ് അടവ് ചേർത്തു.` : `Added ${done.sales} sales (${rupees(done.total)}) and ${done.payments} payments.`}</p>
              <p className="text-sm mt-1 text-ink">See them on <Link className="underline" href="/">Today</Link> and in the <Link className="underline" href="/pattu">Pattu book</Link>.</p>
            </div>
          )}
        </section>

        <section className="min-w-0">
          {reading && <div className="panel p-6 flex items-center gap-3"><Spinner />{t("Reading every line on the page…", "പേജിലെ ഓരോ വരിയും വായിക്കുന്നു…")}</div>}
          {entries && (
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{ml ? `${entries.length} വരികൾ കിട്ടി` : `Found ${entries.length} lines`}</h2>
                  <p className="text-sm text-muted">{t("Check them, untick anything wrong, then add.", "നോക്കി ഉറപ്പാക്കൂ, തെറ്റുള്ളത് ഒഴിവാക്കി ചേർക്കൂ.")}</p>
                </div>
                <Button onClick={save} busy={saving} disabled={!kept.length}>{ml ? `${kept.length} എണ്ണം കണക്കിൽ ചേർക്കൂ` : `Add ${kept.length} to Kanakku`}</Button>
              </div>
              <ul className="border-t border-line">
                {entries.map((e, i) => {
                  const calc = e.billItems.reduce((s, x) => s + x.qty * x.price, 0);
                  return (
                    <li key={i} className={clsx("flex gap-3 pr-4 py-2.5 border-b border-rule", !e.keep && "opacity-45")}>
                      <span className="w-11 shrink-0 flex justify-center pt-1.5 border-r-[1.5px] border-margin">
                        <input type="checkbox" checked={e.keep} onChange={(x) => edit(i, { keep: x.target.checked })} className="size-4 accent-[var(--color-pen)]" aria-label="Include this line" />
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm text-muted italic truncate" title={e.lineText}>“{e.lineText}”</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={clsx("rounded px-1.5 py-0.5 text-xs font-semibold", e.kind === "payment" ? "bg-leaf-soft text-leaf" : e.isCredit ? "bg-due-soft text-due" : "bg-pen-soft text-pen-dark")}>
                            {e.kind === "payment" ? t("Payment", "അടവ്") : e.isCredit ? t("Pattu", "പറ്റ്") : t("Sale", "വിൽപ്പന")}
                          </span>
                          <input value={e.customerName ?? ""} onChange={(x) => edit(i, { customerName: x.target.value || null })} placeholder="Customer" className={clsx(inputCls, "h-8 w-36 text-sm")} aria-label="Customer" />
                          {e.kind === "sale" && (
                            <label className="flex items-center gap-1 text-sm text-muted">
                              <input type="checkbox" checked={e.isCredit} onChange={(x) => edit(i, { isCredit: x.target.checked })} className="accent-[var(--color-due)]" /> pattu
                            </label>
                          )}
                          {e.date && <span className="text-xs text-muted num">{new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                          {e.confidence < 0.6 && <span className="text-xs text-warn font-semibold">Hard to read, please check</span>}
                        </div>
                        {e.billItems.length > 0 && (
                          <p className="text-sm">{e.billItems.map((b) => `${b.nameMl ?? b.name} ${qtyLabel(b.qty, b.unit)}`).join(", ")}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <label className="sr-only" htmlFor={`amt-${i}`}>Amount</label>
                        <input id={`amt-${i}`} type="number" step="any" value={e.amount} onChange={(x) => edit(i, { amount: Number(x.target.value) })}
                          className={clsx("num w-24 h-9 rounded-md border border-line bg-paper px-2 text-right font-semibold", e.kind === "payment" ? "text-leaf" : e.isCredit ? "text-due" : "text-pen-dark")} />
                        {e.kind === "sale" && calc > 0 && Math.abs(calc - e.amount) >= 1 && (
                          <p className="text-[0.7rem] text-muted mt-0.5 num">price list says {rupees(calc)}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {raw && (
                <details className="px-5 py-3 text-sm">
                  <summary className="cursor-pointer text-muted">Everything written on the page</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-ink">{raw}</pre>
                </details>
              )}
            </div>
          )}
          {!entries && !reading && (
            <div className="panel ledger overflow-hidden hidden lg:block" aria-hidden>
              <p className="ledger-row pl-14 text-faint">Lines from your page show up here,</p>
              <p className="ledger-row pl-14 text-faint">ready to check before they are saved.</p>
              {Array.from({ length: 7 }).map((_, i) => <p key={i} className="ledger-row" />)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
