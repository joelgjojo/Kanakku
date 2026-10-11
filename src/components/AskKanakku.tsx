"use client";
import { useState } from "react";
import clsx from "clsx";
import { Mic, Send, Sparkles, Square } from "lucide-react";
import { api } from "@/lib/client";
import { useRecorder } from "./useRecorder";
import { ErrorNote, Spinner } from "./ui";
import { useLang } from "@/lib/i18n";

const EXAMPLES = [
  "ഈ ആഴ്ച ഏറ്റവും ലാഭം തന്ന സാധനം?",
  "Who should I stop giving pattu to?",
  "How much rice should I order this week?",
  "Was today better than last Sunday?",
];
const EXAMPLES_ML = [
  "ഈ ആഴ്ച ഏറ്റവും ലാഭം തന്ന സാധനം?",
  "ആർക്കാണ് ഇനി പറ്റ് കൊടുക്കേണ്ടാത്തത്?",
  "ഈ ആഴ്ച എത്ര അരി ഓർഡർ ചെയ്യണം?",
  "ഇന്ന് കഴിഞ്ഞ ആഴ്ചയേക്കാൾ നല്ലതായിരുന്നോ?",
];

/** Ask the shop's own numbers anything, by typing or speaking. */
export function AskKanakku() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ heard: string; answer: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { t, ml } = useLang();

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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Sparkles size={18} className="text-pen" />
        <h2 className="text-lg font-semibold whitespace-nowrap">{t("Ask Kanakku", "കണക്കിനോട് ചോദിക്കൂ")}</h2>
        <span className="basis-full sm:basis-auto text-sm text-muted">{t("about your shop, in Malayalam, English or Hindi", "കടയെക്കുറിച്ച് എന്തും, മലയാളത്തിലോ ഇംഗ്ലീഷിലോ")}</span>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); askText(q); }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={rec.state === "recording" ? t(`Listening… ${rec.seconds}s`, `കേൾക്കുന്നു… ${rec.seconds}s`) : "ഈ മാസം പറ്റ് എത്ര കിട്ടാനുണ്ട്?"}
          className="h-11 flex-1 min-w-0 rounded-lg border border-line bg-paper px-3 text-[0.95rem] placeholder:text-faint focus:border-pen focus:outline-none"
          aria-label={t("Your question", "നിങ്ങളുടെ ചോദ്യം")}
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
        {(ml ? EXAMPLES_ML : EXAMPLES).map((ex) => (
          <button key={ex} onClick={() => askText(ex)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink hover:bg-wall disabled:opacity-50">
            {ex}
          </button>
        ))}
      </div>
      {busy && <p className="mt-4 flex items-center gap-2 text-muted"><Spinner size={16} /> {t("Looking through your accounts…", "കണക്കുകൾ നോക്കുന്നു…")}</p>}
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
