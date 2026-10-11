"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Mic, Paperclip, Send, Square } from "lucide-react";
import { api, compressImage } from "@/lib/client";
import { useRecorder } from "@/components/useRecorder";
import { PageHeader } from "@/components/ui";

interface Msg { id: number; from: "shop" | "bot"; text?: string; image?: string; audio?: string; at: Date; pending?: boolean }

const SAMPLES = ["രാജന് 2 കിലോ പഞ്ചസാര പറ്റ്", "Suma 300 thannu", "50 kilo ari vannu", "stock", "pattu", "innathe kanakku", "morning", "evening", "Rajan ko 2 kilo cheeni udhaar"];

let nextId = 1;

export default function WhatsApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    send({ text: "hi" }, true);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  async function send(input: { text?: string; file?: Blob; kind?: "audio" | "image" }, silent = false) {
    const id = nextId++;
    if (!silent) {
      const url = input.file ? URL.createObjectURL(input.file) : undefined;
      setMsgs((m) => [...m, { id, from: "shop", text: input.text, image: input.kind === "image" ? url : undefined, audio: input.kind === "audio" ? url : undefined, at: new Date() }]);
    }
    const waitId = nextId++;
    setMsgs((m) => [...m, { id: waitId, from: "bot", at: new Date(), pending: true }]);
    setBusy(true);
    try {
      const form = new FormData();
      if (input.text) form.append("text", input.text);
      if (input.file) form.append("media", input.file, input.kind === "audio" ? "voice.wav" : "photo.jpg");
      const r = await api<{ reply: string }>("/api/bot", { method: "POST", body: form });
      setMsgs((m) => m.map((x) => (x.id === waitId ? { ...x, text: r.reply, pending: false, at: new Date() } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === waitId ? { ...x, text: `⚠️ ${(e as Error).message}`, pending: false } : x)));
    } finally {
      setBusy(false);
    }
  }

  const rec = useRecorder((wav) => send({ file: wav, kind: "audio" }));

  const onPhoto = async (f?: File) => {
    if (!f) return;
    const caption = text.trim();
    setText("");
    send({ file: await compressImage(f), kind: "image", text: caption || undefined });
  };

  return (
    <>
      <PageHeader title="WhatsApp bot" titleMl="വാട്സ്ആപ്പ് ബോട്ട്" ml="കടയുടമ ഒന്നും പുതുതായി പഠിക്കേണ്ട" />
      <div className="px-4 lg:px-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        {/* Phone */}
        <section className="mx-auto w-full max-w-[26rem] rounded-[2rem] border-[10px] border-ink bg-ink shadow-[0_18px_40px_-18px_rgb(24_32_46/0.45)] overflow-hidden">
          <div className="flex items-center gap-3 bg-[#1f6b52] px-4 py-3 text-white">
            <span className="grid place-items-center size-9 rounded-full bg-sign text-ink sign text-lg">ക</span>
            <div className="leading-tight">
              <p className="font-semibold">Kanakku</p>
              <p className="text-xs text-white/75">{busy ? "typing…" : "online"}</p>
            </div>
          </div>
          <div className="h-[30rem] overflow-y-auto bg-[#ece5dd] px-3 py-3 space-y-2" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={clsx("flex", m.from === "shop" ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[85%] rounded-xl px-3 py-2 text-[0.92rem] shadow-[0_1px_0_rgb(0_0_0/0.08)]", m.from === "shop" ? "bg-[#d9fdd3] rounded-tr-sm" : "bg-white rounded-tl-sm")}>
                  {m.pending ? (
                    <span className="flex gap-1 py-1" aria-label="Kanakku is typing">
                      {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-faint animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </span>
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.image && <img src={m.image} alt="Sent photo" className="rounded-lg mb-1 max-h-48" />}
                      {m.audio && <audio controls src={m.audio} className="h-9 max-w-full" />}
                      {m.text && <p className="whitespace-pre-wrap break-words">{m.text.split(/(\*[^*]+\*)/g).map((part, i) => part.startsWith("*") && part.endsWith("*") ? <b key={i}>{part.slice(1, -1)}</b> : part)}</p>}
                    </>
                  )}
                  <p className="text-[0.65rem] text-muted text-right mt-0.5">{m.at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send({ text: text.trim() }); setText(""); } }}>
            <label className="p-2 rounded-full text-muted hover:bg-white cursor-pointer" aria-label="Send a photo">
              <Paperclip size={20} />
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={rec.state === "recording" ? `Recording… ${rec.seconds}s` : "Message"} className="flex-1 h-10 rounded-full bg-white px-4 text-[0.95rem] focus:outline-none" aria-label="Message" />
            {text.trim() ? (
              <button type="submit" className="grid place-items-center size-10 rounded-full bg-[#1f6b52] text-white" aria-label="Send"><Send size={18} /></button>
            ) : (
              <button type="button" onClick={rec.toggle} className={clsx("grid place-items-center size-10 rounded-full text-white", rec.state === "recording" ? "bg-margin recording" : "bg-[#1f6b52]")} aria-label={rec.state === "recording" ? "Stop and send voice note" : "Record a voice note"}>
                {rec.state === "recording" ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
              </button>
            )}
          </form>
          {rec.error && <p className="bg-due-soft text-due text-sm px-3 py-2">{rec.error}</p>}
        </section>

        {/* Explainer + setup */}
        <section className="space-y-5 max-w-2xl">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Try it</h2>
            <p className="text-muted mt-1">This is the same bot that answers on the shop&apos;s WhatsApp number. Hold the mic for a voice note, send a notebook photo, or tap a message below.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button key={s} disabled={busy} onClick={() => send({ text: s })} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-wall disabled:opacity-50">{s}</button>
              ))}
            </div>
            <p className="text-sm text-muted mt-3">Photo tip: add the caption <b className="text-ink">shelf</b> to count a shelf instead of reading a notebook page.</p>
          </div>

          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Kanakku messages you first</h2>
            <p className="text-muted mt-1">The owner doesn&apos;t have to ask. Every day on WhatsApp:</p>
            <ul className="mt-2 space-y-1.5 text-[0.95rem]">
              <li>☀️ <b>8 am:</b> what to order today, whose pattu to collect, yesterday vs last week.</li>
              <li>🌙 <b>9 pm:</b> the day&apos;s sales and profit, and what the cash drawer should hold.</li>
            </ul>
            <p className="text-sm text-muted mt-2">Tap <b className="text-ink">morning</b> or <b className="text-ink">evening</b> above to see them. Shop helpers can bill in Hindi too: try the last message.</p>
          </div>

          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Connect a real WhatsApp number</h2>
            <p className="text-sm mt-1 font-semibold text-leaf">
              {"The simulator above uses the same bot, so it works even without a real number."}
            </p>
            <p className="text-sm text-muted mt-1">Free, with any spare WhatsApp number. Runs on a laptop, like WhatsApp Web.</p>
            <ol className="mt-3 space-y-2 text-[0.95rem] list-decimal pl-5">
              <li>Use a spare number, not your main one. WhatsApp doesn&apos;t officially allow bots on normal accounts.</li>
              <li>In the project, copy <code className="rounded bg-wall px-1">bridge/.env.example</code> to <code className="rounded bg-wall px-1">bridge/.env</code> and list the numbers that may use the bot in <code className="rounded bg-wall px-1">BRIDGE_ALLOW</code>.</li>
              <li>Run <code className="rounded bg-wall px-1">npm run whatsapp</code> and scan the QR from the spare phone: <b>Settings → Linked devices → Link a device</b>.</li>
              <li>When it says <b>Connected</b>, message the spare number. Replies come from Kanakku and bills show up here live.</li>
            </ol>
          </div>
        </section>
      </div>
    </>
  );
}
