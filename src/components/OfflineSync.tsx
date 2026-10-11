"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

const KEY = "kanakku.queue";

export interface QueuedBill { body: unknown; at: string }

export function readQueue(): QueuedBill[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
export function enqueueBill(body: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...readQueue(), { body, at: new Date().toISOString() }]));
    window.dispatchEvent(new Event("kanakku-queue"));
  } catch { /* storage blocked: nothing we can do */ }
}

/** Bills saved while the internet was down sync automatically when it comes back. */
export function OfflineSync() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const refresh = () => setPending(readQueue().length);
    const flush = async () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) return;
      const q = readQueue();
      const left: QueuedBill[] = [];
      for (const item of q) {
        try {
          const res = await fetch("/api/bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
          if (!res.ok && res.status >= 500) left.push(item);
        } catch {
          left.push(item);
        }
      }
      try { localStorage.setItem(KEY, JSON.stringify(left)); } catch {}
      refresh();
    };
    refresh();
    flush();
    const off = () => setOnline(false);
    window.addEventListener("online", flush);
    window.addEventListener("offline", off);
    window.addEventListener("kanakku-queue", refresh);
    const t = setInterval(flush, 20000);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", off);
      window.removeEventListener("kanakku-queue", refresh);
      clearInterval(t);
    };
  }, []);

  if (online && !pending) return null;
  return (
    <div className="mx-4 mt-3 lg:mx-8 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      <WifiOff size={16} />
      {online ? `Syncing ${pending} saved bill${pending > 1 ? "s" : ""}…` : `No internet. Bills are saved on this phone${pending ? ` (${pending} waiting)` : ""} and will sync later.`}
    </div>
  );
}
