// Shop PIN lock. Off until SHOP_PIN is set (in .env.local and in Vercel).
// With it set, only someone who entered the PIN (or the WhatsApp bridge, which sends it) can see
// or change the shop's data. Customer pattu pages, the privacy page and the signed WhatsApp
// webhooks stay public.
import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "kanakku_session";

const PUBLIC = [
  /^\/login$/,
  /^\/k\//,
  /^\/privacy$/,
  /^\/api\/login$/,
  /^\/api\/status$/,
  /^\/api\/whatsapp(\/meta)?$/, // Twilio and Meta sign their requests; those routes check it
];

async function sessionToken(pin: string) {
  const data = new TextEncoder().encode(`kanakku-session:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const pin = process.env.SHOP_PIN;
  if (!pin) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  const token = await sessionToken(pin);
  const ok = req.cookies.get(COOKIE)?.value === token || req.headers.get("x-shop-pin") === pin;
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked. Enter the shop PIN first." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
