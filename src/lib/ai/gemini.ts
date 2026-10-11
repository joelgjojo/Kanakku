import { GoogleGenAI } from "@google/genai";

// Try the configured model first, then fall back if Google has retired it
// or it is rate limited. Keeps the demo alive on stage.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);

let client: GoogleGenAI | null = null;

export const hasGemini = () => !!process.env.GEMINI_API_KEY;

function ai() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export interface Media {
  mimeType: string;
  data: string; // base64
}

// A bill doesn't need deep reasoning: minimal thinking cuts the wait from ~6 s to ~2 s.
// Handwriting and shelf counting get a little more.
export type Effort = "fast" | "careful";

function thinking(model: string, effort: Effort) {
  if (/^gemini-2/.test(model)) return { thinkingBudget: effort === "fast" ? 0 : 1024 };
  return { thinkingLevel: (effort === "fast" ? "MINIMAL" : "LOW") as never };
}

/** Which model answered the last call and how long each try took (for logs and the speed test). */
export let lastCall: { model: string | null; ms: number; tries: { model: string; ms: number; error?: string }[] } = { model: null, ms: 0, tries: [] };

/** Ask Gemini for JSON matching `schema`. Media (audio/image) is optional. */
export async function askJSON<T>(prompt: string, schema: object, media?: Media, effort: Effort = "fast"): Promise<T> {
  const parts: { text?: string; inlineData?: Media }[] = [];
  if (media) parts.push({ inlineData: { mimeType: cleanMime(media.mimeType), data: media.data } });
  parts.push({ text: prompt });

  let lastErr: unknown;
  const started = Date.now();
  const tries: { model: string; ms: number; error?: string }[] = [];
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const call = (withThinking: boolean) =>
        ai().models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            temperature: 0.1,
            ...(withThinking ? { thinkingConfig: thinking(model, effort) } : {}),
          },
        });
      let res;
      try {
        res = await call(true);
      } catch (e) {
        // Some models don't accept a thinking setting. Ask again without it.
        if (!/thinking/i.test(String((e as Error)?.message))) throw e;
        res = await call(false);
      }
      const text = res.text;
      if (!text) throw new Error("Empty response from Gemini");
      tries.push({ model, ms: Date.now() - t0 });
      lastCall = { model, ms: Date.now() - started, tries };
      console.log(`[kanakku] gemini ${model} ${Date.now() - started} ms` + (tries.length > 1 ? ` (tries: ${tries.map((t) => `${t.model} ${t.ms}ms${t.error ? ` ${t.error}` : ""}`).join(", ")})` : ""));
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      tries.push({ model, ms: Date.now() - t0, error: msg.slice(0, 80) });
      lastCall = { model: null, ms: Date.now() - started, tries };
      // Only move to the next model for "model not found / overloaded / quota" style errors.
      if (!/404|not found|unsupported|429|quota|exhausted|503|overloaded|unavailable/i.test(msg)) break;
    }
  }
  throw friendly(lastErr);
}

// Turn Google's raw errors into something the team can act on.
function friendly(e: unknown): Error {
  const msg = String((e as Error)?.message ?? e);
  console.error("[kanakku] Gemini error from Google:", msg);
  if (/API key not valid|API_KEY_INVALID|401|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|PERMISSION_DENIED|403/i.test(msg)) {
    return new Error("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local, then restart npm run dev. Run npm run test:ai to see Google's full error.");
  }
  if (/429|quota|exhausted/i.test(msg)) return new Error("Gemini free quota is used up for now. Wait a minute, or use another key.");
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(msg)) return new Error("Can't reach Gemini. Check the internet connection. Typed bills still work offline.");
  return e instanceof Error ? e : new Error(msg);
}

// Browsers send things like "audio/webm;codecs=opus". Gemini wants the bare type.
function cleanMime(m: string) {
  const base = m.split(";")[0].trim().toLowerCase();
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/opus") return "audio/ogg";
  return base;
}
