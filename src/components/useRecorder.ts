"use client";
import { useCallback, useRef, useState } from "react";
import { toWav } from "@/lib/client";

export type RecState = "idle" | "recording" | "processing";

/** Tap to start, tap to stop. Returns a WAV blob. */
export function useRecorder(onDone: (wav: Blob) => void | Promise<void>) {
  const [state, setState] = useState<RecState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setState("processing");
        try {
          const wav = await toWav(new Blob(chunks, { type: r.mimeType }));
          await onDone(wav);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setState("idle");
        }
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setError("Microphone blocked. Allow mic access in the browser, or type the bill.");
    }
  }, [onDone]);

  const stop = useCallback(() => rec.current?.state === "recording" && rec.current.stop(), []);
  const toggle = useCallback(() => (state === "recording" ? stop() : state === "idle" ? start() : undefined), [state, start, stop]);

  return { state, error, seconds, toggle, setError };
}
