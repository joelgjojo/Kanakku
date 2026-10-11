"use client";
import { useState } from "react";
import clsx from "clsx";
import { Camera, Check, ImagePlus } from "lucide-react";
import { api, compressImage } from "@/lib/client";
import { unitLabel } from "@/lib/format";
import type { Product, ShelfCount } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { Button, ErrorNote, PageHeader, Spinner } from "@/components/ui";

type Row = ShelfCount & { product: Product | null; recorded: number | null; diff: number | null; accept?: boolean };

export default function Shelf() {
  const { t, ml } = useLang();
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [changed, setChanged] = useState<number | null>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setRows(null); setErr(null); setChanged(null);
    const small = await compressImage(f);
    setBlob(small);
    setPreview(URL.createObjectURL(small));
  };

  const check = async () => {
    if (!blob) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.append("image", blob, "shelf.jpg");
      const r = await api<{ rows: Row[]; notes: string }>("/api/ai/shelf", { method: "POST", body: form });
      setRows(r.rows.map((x) => ({ ...x, accept: x.product !== null && x.diff !== null && Math.abs(x.diff) > 0 && x.confidence >= 0.6 })));
      setNotes(r.notes);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const counts = rows!.filter((r) => r.accept && r.product).map((r) => ({ productId: r.product!.id, counted: r.counted }));
      const res = await api<{ changed: number }>("/api/shelf/apply", { json: { counts } });
      setChanged(res.changed);
      setRows(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const mismatches = rows?.filter((r) => r.diff !== null && Math.abs(r.diff) >= Math.max(1, (r.recorded ?? 0) * 0.15)).length ?? 0;

  return (
    <>
      <PageHeader title="Shelf check" titleMl="ഷെൽഫ് പരിശോധന" ml="ഷെൽഫ് നോക്കി സ്റ്റോക്ക് ഉറപ്പിക്കാം" />
      <div className="px-4 lg:px-8 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-start">
        <section className="panel p-5 space-y-4">
          <p className="text-muted">{t("Photograph a shelf. Kanakku counts what it can see and compares it with what your bills say should be there, so missing or unbilled stock shows up.", "ഷെൽഫിന്റെ ഫോട്ടോ എടുക്കൂ. കാണുന്നത് എണ്ണി, ബില്ലുകൾ പ്രകാരം ഉണ്ടാകേണ്ടതുമായി ഒത്തുനോക്കും. കാണാതായതും ബില്ലാകാത്തതും അറിയാം.")}</p>
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
              <img src={preview} alt="Shelf to count" className="w-full rounded-lg border border-line" />
              {!rows && <Button onClick={check} busy={busy} className="w-full h-12 text-base">{busy ? t("Counting…", "എണ്ണുന്നു…") : t("Count this shelf", "ഈ ഷെൽഫ് എണ്ണൂ")}</Button>}
            </>
          )}
          <ErrorNote>{err}</ErrorNote>
          {changed !== null && (
            <p className="rounded-lg bg-leaf-soft p-3 text-leaf font-semibold flex items-center gap-2 slip-in"><Check size={18} />{ml ? `${changed} സാധനങ്ങളുടെ സ്റ്റോക്ക് ശരിയാക്കി.` : `Updated stock for ${changed} items.`}</p>
          )}
        </section>

        <section className="min-w-0">
          {busy && !rows && <div className="panel p-6 flex items-center gap-3"><Spinner />{t("Counting packets and estimating sacks…", "പാക്കറ്റുകൾ എണ്ണുന്നു, ചാക്കുകൾ കണക്കാക്കുന്നു…")}</div>}
          {rows && (
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{mismatches ? (ml ? `${mismatches} സാധനങ്ങൾ കണക്കുമായി ഒത്തുപോകുന്നില്ല` : `${mismatches} items don't match your records`) : t("Shelf matches your records", "ഷെൽഫും കണക്കും ഒത്തു")}</h2>
                  <p className="text-sm text-muted">{notes}</p>
                </div>
                <Button onClick={apply} busy={busy} disabled={!rows.some((r) => r.accept)}>{t("Use shelf count", "ഷെൽഫിലെ എണ്ണം എടുക്കൂ")}</Button>
              </div>
              <div className="grid grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem] gap-2 px-5 py-2 text-xs text-muted border-y border-line">
                <span /><span>{t("Item", "സാധനം")}</span><span className="text-right">{t("On shelf", "ഷെൽഫിൽ")}</span><span className="text-right">{t("Records", "കണക്കിൽ")}</span><span className="text-right">{t("Gap", "വ്യത്യാസം")}</span>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((r, i) => {
                  const big = r.diff !== null && Math.abs(r.diff) >= Math.max(1, (r.recorded ?? 0) * 0.15);
                  return (
                    <li key={i} className="grid grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem] gap-2 items-center px-5 py-2.5">
                      <input type="checkbox" disabled={!r.product} checked={!!r.accept} onChange={(e) => setRows((c) => c!.map((x, j) => (j === i ? { ...x, accept: e.target.checked } : x)))} className="size-4 accent-[var(--color-pen)]" aria-label={`Use shelf count for ${r.name}`} />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{r.product?.nameMl ?? r.name}</span>
                        <span className="block text-xs text-muted">{r.product ? r.product.name : "Not in your stock list"}{r.confidence < 0.6 && " · rough estimate"}</span>
                      </span>
                      <span className="num text-right">{r.counted} {unitLabel[r.unit]}</span>
                      <span className="num text-right text-muted">{r.recorded ?? "-"}</span>
                      <span className={clsx("num text-right font-semibold", big ? (r.diff! < 0 ? "text-due" : "text-warn") : "text-leaf")}>
                        {r.diff === null ? "" : r.diff > 0 ? `+${r.diff}` : r.diff}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="px-5 py-3 text-xs text-muted">Less on the shelf than in records can mean a sale that was never billed, damage or theft.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
