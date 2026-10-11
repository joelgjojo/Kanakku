import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const token = (pin: string) => crypto.createHash("sha256").update(`kanakku-session:${pin}`).digest("hex");

/** Check the shop PIN and keep the phone logged in for 30 days. */
export async function POST(req: Request) {
  const pin = process.env.SHOP_PIN;
  if (!pin) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const given = String(body.pin ?? "");
  const same = given.length === pin.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pin));
  if (!same) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("kanakku_session", token(pin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** Log out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("kanakku_session");
  return res;
}
