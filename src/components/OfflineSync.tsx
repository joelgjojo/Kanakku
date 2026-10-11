"use client";
import { useEffect, useState } from "react";
import { WifiOff, TriangleAlert } from "lucide-react";
import { useLang } from "@/lib/i18n";

const KEY = "kanakku.queue";
const FAILED = "kanakku.failed";

export interface QueuedBill { body: { id?: string } & Record<string, unknown>; at: string; tries?: number; error?: string }

const read = (key: string): QueuedBill[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
};
const write = (key: string, q: QueuedBill[]) => {
  try { localStorage.setItem(key, JSON.stringify(q)); } catch { /* storage blocked */ }
};

export const readQueue = () => read(KEY);

/** A bill id made on the phone, so the server saves a retried bill only once. */
export const newBillId = () =>
  `b-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`}`;

export function enqueueBill(body: QueuedBill["body"]) {
  const withId = { ...body, id: body.id ?? newBillId() };
  const q = read(KEY);
  if (!q.some((x) => x.body.id === withId.id)) write(KEY, [...q, { body: withId, at: new Date().toISOString() }]);
  window.dispatchEvent(new Event("kanakku-queue"));
}

let flushing = false;

/**
 * Bills saved while the internet was down sync when it comes back.
 * A bill leaves the phone's queue only when the server confirms it. Each bill carries its own id,
 * so if the connection drops after the server saved it, sending it again doesn't make a second bill.
 * A bill the server refuses (bad data) is kept aside and shown, never silently thrown away.
 */
export function OfflineSync() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<QueuedBill[]>([]);
  const [online, setOnline] = useState(true);
  const { t, ml } = useLang();

  useEffect(() => {
    const refresh = () => { setPending(read(KEY).length); setFailed(read(FAILED)); };
    const flush = async () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine || flushing) return;
      flushing = true;
      try {
        for (const item of read(KEY)) {
          let res: Response;
          try {
            res = await fetch("/api/bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
          } catch {
            break; // network still down: try again later, keep everything
          }
          const done = () => write(KEY, read(KEY).filter((x) => x.body.id !== item.body.id));
          if (res.ok) done();
          else if (res.status >= 500 || res.status === 429 || res.status === 408) {
            write(KEY, read(KEY).map((x) => (x.body.id === item.body.id ? { ...x, tries: (x.tries ?? 0) + 1 } : x)));
            break; // server trouble: keep it and retry later
          } else {
            const error = await res.json().then((j) => j.error as string).catch(() => `HTTP ${res.status}`);
            write(FAILED, [...read(FAILED), { ...item, error }]);
            done();
          }
        }
      } finally {
        flushing = false;
        refresh();
      }
    };
    refresh();
    flush();
    const off = () => setOnline(false);
    window.addEventListener("online", flush);
    window.addEventListener("offline", off);
    window.addEventListener("kanakku-queue", flush);
    const timer = setInterval(flush, 15000);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", off);
      window.removeEventListener("kanakku-queue", flush);
      clearInterval(timer);
    };
  }, []);

  if (online && !pending && !failed.length) return null;
  return (
    <div className="mx-4 mt-3 lg:mx-8 space-y-2">
      {(!online || pending > 0) && (
        <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <WifiOff size={16} className="shrink-0" />
          {online
            ? ml ? `സേവ് ചെയ്ത ${pending} ബിൽ സിങ്ക് ചെയ്യുന്നു…` : `Syncing ${pending} saved bill${pending > 1 ? "s" : ""}…`
            : ml
              ? `നെറ്റ് ഇല്ല. ബില്ലുകൾ ഈ ഫോണിൽ സേവ് ആകും${pending ? ` (${pending} കാത്തിരിക്കുന്നു)` : ""}, നെറ്റ് വന്നാൽ തനിയെ സിങ്ക് ആകും.`
              : `No internet. Bills are saved on this phone${pending ? ` (${pending} waiting)` : ""} and will sync by themselves.`}
        </div>
      )}
      {failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-due-soft px-3 py-2 text-sm text-due">
          <TriangleAlert size={16} className="shrink-0" />
          <span className="flex-1 min-w-0">
            {ml ? `${failed.length} ബിൽ സേവ് ആയില്ല` : `${failed.length} saved bill${failed.length > 1 ? "s" : ""} couldn't be added`}: {failed[0].error}
          </span>
          <button
            className="font-semibold underline"
            onClick={() => { write(KEY, [...read(KEY), ...failed.map((x) => ({ body: x.body, at: x.at, tries: 0 }))]); write(FAILED, []); window.dispatchEvent(new Event("kanakku-queue")); }}
          >
            {t("Try again", "വീണ്ടും ശ്രമിക്കൂ")}
          </button>
          <button className="font-semibold" onClick={() => { write(FAILED, []); setFailed([]); }}>
            {t("Discard", "ഒഴിവാക്കൂ")}
          </button>
        </div>
      )}
    </div>
  );
}
