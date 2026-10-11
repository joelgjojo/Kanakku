import { handleMessage } from "@/lib/bot";
import { fail, fileToMedia, ok } from "@/lib/http";

export const maxDuration = 60;

// In-app WhatsApp simulator: same brain as the real WhatsApp number.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = (form.get("text") as string | null) ?? "";
    const media = await fileToMedia(form.get("media"));
    const res = await handleMessage({ text, media, source: "whatsapp" });
    console.log(
      `[kanakku] bot: ${media ? media.mimeType : "text"} → ${res.kind}` +
        (res.parsed ? ` | intent=${res.parsed.intent} engine=${res.parsed.engine} heard="${res.parsed.transcript.slice(0, 120)}" items=${res.parsed.items.length}` : "") +
        ` | reply="${res.reply.split("\n")[0].slice(0, 100)}"`,
    );
    return ok(res);
  } catch (e) {
    return fail(e, 500);
  }
}
