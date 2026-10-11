"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Camera, FileText, Languages, MessageCircle, Mic, Package, Receipt, ScanSearch } from "lucide-react";
import clsx from "clsx";
import { OfflineSync } from "./OfflineSync";
import { LangProvider, useLang } from "@/lib/i18n";

const NAV = [
  { href: "/", label: "Today", ml: "ഇന്ന്", mlFull: "ഇന്ന്", icon: CalendarDays, mobile: true },
  { href: "/bill", label: "New bill", ml: "ബിൽ", mlFull: "പുതിയ ബിൽ", icon: Mic, mobile: true },
  { href: "/pattu", label: "Pattu book", ml: "പറ്റ്", mlFull: "പറ്റ് ബുക്ക്", icon: BookOpen, mobile: true },
  { href: "/stock", label: "Stock", ml: "സ്റ്റോക്ക്", mlFull: "സ്റ്റോക്ക്", icon: Package, mobile: true },
  { href: "/notebook", label: "Notebook", ml: "നോട്ട്ബുക്ക്", mlFull: "നോട്ട്ബുക്ക്", icon: Camera, mobile: true },
  { href: "/purchase", label: "Supplier bill", ml: "പർച്ചേസ്", mlFull: "സപ്ലയർ ബിൽ", icon: Receipt, mobile: false },
  { href: "/shelf", label: "Shelf check", ml: "ഷെൽഫ്", mlFull: "ഷെൽഫ് പരിശോധന", icon: ScanSearch, mobile: false },
  { href: "/whatsapp", label: "WhatsApp bot", ml: "വാട്സ്ആപ്പ്", mlFull: "വാട്സ്ആപ്പ് ബോട്ട്", icon: MessageCircle, mobile: false },
  { href: "/report", label: "Loan report", ml: "റിപ്പോർട്ട്", mlFull: "ലോൺ റിപ്പോർട്ട്", icon: FileText, mobile: false },
];

interface Status { ai: "gemini" | "offline"; store: "local" | "supabase"; whatsapp: boolean; shopName: string }

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <Shell>{children}</Shell>
    </LangProvider>
  );
}

/** The English / മലയാളം switch. */
function LangSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div role="radiogroup" aria-label="Language" className={clsx("inline-flex items-center rounded-lg border border-line bg-wall p-0.5 text-xs font-semibold", compact && "text-[0.7rem]")}>
      {!compact && <Languages size={14} className="mx-1.5 text-muted" aria-hidden />}
      {(["en", "ml"] as const).map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          onClick={() => setLang(l)}
          className={clsx("rounded-md px-2 h-7", lang === l ? "bg-paper text-ink shadow-[0_1px_0_var(--color-line)]" : "text-muted hover:text-ink")}
        >
          {l === "en" ? "English" : "മലയാളം"}
        </button>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { ml } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    if (path.startsWith("/k/")) return;
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, [path]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  // Customer pages (/k/…) are for the shop's customers: no shop menus there.
  if (path.startsWith("/k/")) return <>{children}</>;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail */}
      <aside className="print:hidden hidden lg:flex w-64 shrink-0 flex-col border-r border-line bg-paper px-4 py-6 sticky top-0 h-dvh">
        <Link href="/" className="block px-2">
          <span className="sign text-[2.1rem] text-ink">കണക്ക്</span>
          <span className="block text-sm text-muted mt-1">{status?.shopName ?? " "}</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.95rem] transition-colors",
                active(n.href) ? "bg-pen-soft text-pen-dark font-semibold" : "text-ink hover:bg-wall",
              )}
            >
              <n.icon size={18} strokeWidth={active(n.href) ? 2.4 : 1.8} />
              <span className="flex-1">{ml ? n.mlFull : n.label}</span>
              {!ml && <span className="text-xs text-faint">{n.ml}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted space-y-1">
          <div className="mb-3"><LangSwitch /></div>
          <StatusLine status={status} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="print:hidden lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 backdrop-blur px-4 h-14">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="sign text-2xl">കണക്ക്</span>
          <span className="text-xs text-muted truncate max-w-[9rem]">{status?.shopName}</span>
        </Link>
        <div className="flex items-center gap-1">
          <LangSwitch compact />
          <Link href="/shelf" aria-label="Shelf check" className={clsx("p-2 rounded-lg", active("/shelf") && "bg-pen-soft text-pen")}><ScanSearch size={20} /></Link>
          <Link href="/whatsapp" aria-label="WhatsApp bot" className={clsx("p-2 rounded-lg", active("/whatsapp") && "bg-pen-soft text-pen")}><MessageCircle size={20} /></Link>
        </div>
      </header>

      <main className="flex-1 min-w-0 pb-24 lg:pb-10">
        <OfflineSync />
        {children}
      </main>

      {/* Mobile bottom tabs */}
      <nav className="print:hidden lg:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={clsx("flex flex-col items-center gap-0.5 py-2 text-[0.7rem]", active(n.href) ? "text-pen font-semibold" : "text-muted")}
          >
            {n.href === "/bill" ? (
              <span className={clsx("grid place-items-center size-9 -mt-0.5 rounded-full", active(n.href) ? "bg-sign text-ink" : "bg-ink text-paper")}>
                <n.icon size={18} />
              </span>
            ) : (
              <n.icon size={21} strokeWidth={active(n.href) ? 2.4 : 1.8} />
            )}
            <span>{ml ? n.ml : n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function StatusLine({ status }: { status: Status | null }) {
  const { t } = useLang();
  if (!status) return null;
  return (
    <>
      <p className="flex items-center gap-2">
        <Dot ok={status.ai === "gemini"} />
        {status.ai === "gemini" ? t("Gemini AI connected", "Gemini AI കണക്റ്റഡ്") : t("Offline parser (no AI key)", "ഓഫ്‌ലൈൻ മോഡ് (AI കീ ഇല്ല)")}
      </p>
      <p className="flex items-center gap-2">
        <Dot ok />
        {status.store === "supabase" ? t("Saved to Supabase", "Supabase-ൽ സേവ് ചെയ്യുന്നു") : t("Saved on this computer", "ഈ കമ്പ്യൂട്ടറിൽ സേവ് ചെയ്യുന്നു")}
      </p>
      <p className="flex items-center gap-2">
        <Dot ok />
        {t("WhatsApp: bot + simulator ready", "വാട്സ്ആപ്പ് ബോട്ട് റെഡി")}
      </p>
    </>
  );
}

const Dot = ({ ok }: { ok: boolean }) => (
  <span className={clsx("inline-block size-2 rounded-full", ok ? "bg-leaf" : "bg-sign-dark")} aria-hidden />
);
