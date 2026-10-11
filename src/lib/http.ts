import { NextResponse } from "next/server";
import type { Media } from "./ai/gemini";

export const ok = <T,>(data: T) => NextResponse.json(data);
export const fail = (e: unknown, status = 400) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

export async function fileToMedia(f: FormDataEntryValue | null): Promise<Media | undefined> {
  if (!f || typeof f === "string" || f.size === 0) return undefined;
  const buf = Buffer.from(await f.arrayBuffer());
  return { mimeType: f.type || "application/octet-stream", data: buf.toString("base64") };
}
