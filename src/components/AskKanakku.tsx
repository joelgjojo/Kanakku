"use client";
import { useState } from "react";
import clsx from "clsx";
import { Mic, Send, Sparkles, Square } from "lucide-react";
import { api } from "@/lib/client";
import { useRecorder } from "./useRecorder";
import { ErrorNote, Spinner } from "./ui";

const EXAMPLES = [
  "ഈ ആഴ്ച ഏറ്റവും ലാഭം തന്ന സാധനം?",
  "Who should I stop giving pattu to?",
  "How much rice should I order this week?",
  "Was today better than last Sunday?",
];

/** Ask the shop's own numbers anything, by typing or speaking. */
export function AskKanakku() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ heard: string; answer: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (form: FormData) => {
    setBusy(true);
    setErr(null);
    try {
      setAnswer(await api("/api/ask", { method: "POST", body: form }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const askText = (text: string) => {
    if (!text.trim()) return;
    const f = new FormData();
    f.append("question", text.trim());
    setQ("");
    ask(f);
  };
  const rec = useRecorder(async (wav) => {
    const f = new FormData();
    f.append("audio", wav, "question.wav");
    await ask(f);
  });

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-pen" />
        <h2 className="text-lg font-semibold">Ask Kanakku</h2>
        <span className="text-sm text-muted">about your shop, in Malayalam or English</span>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); askText(q); }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={rec.state === "recording" ? `Listening… ${rec.seconds}s` : "ഈ മാസം പറ്റ് എത്ര കിട്ടാനുണ്ട്?"}
          className="h-11 flex-1 min-w-0 rounded-lg border border-line bg-paper px-3 text-[0.95rem] placeholder:text-faint focus:border-pen focus:outline-none"
          aria-label="Your question"
        />
        <button
          type="button"
          onClick={rec.toggle}
          disabled={busy}
          aria-label={rec.state === "recording" ? "Stop and ask" : "Ask by voice"}
          className={clsx("grid place-items-center size-11 rounded-lg shrink-0", rec.state === "recording" ? "bg-margin text-white recording" : "bg-sign text-ink")}
        >
          {rec.state === "recording" ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
        </button>
        <button type="submit" disabled={!q.trim() || busy} aria-label="Ask" className="grid place-items-center size-11 rounded-lg bg-pen text-white shrink-0 disabled:opacity-40">
          <Send size={17} />
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => askText(ex)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink hover:bg-wall disabled:opacity-50">
            {ex}
          </button>
        ))}
      </div>
      {busy && <p className="mt-4 flex items-center gap-2 text-muted"><Spinner size={16} /> Looking through your accounts…</p>}
      <ErrorNote>{err || rec.error}</ErrorNote>
      {answer && !busy && (
        <div className="mt-4 rounded-lg bg-pen-soft px-4 py-3 slip-in">
          <p className="text-xs text-muted">“{answer.heard}”</p>
          <p className="mt-1 whitespace-pre-wrap text-[1.02rem] text-ink">{answer.answer}</p>
        </div>
      )}
    </section>
  );
}
