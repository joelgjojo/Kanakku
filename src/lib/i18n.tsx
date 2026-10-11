"use client";
// English / Malayalam switch for the shop app. Every label is written in both: t("Stock", "സ്റ്റോക്ക്").
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UiLang = "en" | "ml";

const Ctx = createContext<{ lang: UiLang; setLang: (l: UiLang) => void }>({ lang: "en", setLang: () => {} });
const KEY = "kanakku-lang";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "ml" || saved === "en") setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const t = useCallback((en: string, ml: string) => (lang === "ml" ? ml : en), [lang]);
  return { lang, setLang, t, ml: lang === "ml" };
}

/** "3 days" / "3 ദിവസം" */
export const daysLabel = (n: number, ml: boolean) => (ml ? `${n} ദിവസം` : `${n} day${n === 1 ? "" : "s"}`);

const TRUST_ML: Record<string, string> = { Reliable: "വിശ്വസിക്കാം", Watch: "ശ്രദ്ധിക്കണം", Risky: "റിസ്ക്", New: "പുതിയത്" };
export const trustLabel = (label: string, ml: boolean) => (ml ? TRUST_ML[label] ?? label : label);

/** The trust reason line, in Malayalam when needed (the server writes it in English). */
export function trustReason(b: { trust: { reason: string; avgDaysToPay: number | null; label: string }; oldestUnpaidDays: number }, ml: boolean) {
  if (!ml) return b.trust.reason;
  if (b.trust.label === "New") return "പറ്റിൽ പുതിയ ആളാണ്. ചെറിയ പരിധിയിൽ തുടങ്ങൂ.";
  if (b.trust.avgDaysToPay === null) return "പറ്റ് എടുത്തിട്ടുണ്ട്, പക്ഷേ ഇതുവരെ ഒന്നും തിരിച്ചടച്ചിട്ടില്ല.";
  const d = Math.max(1, Math.round(b.trust.avgDaysToPay));
  return `സാധാരണ ${d} ദിവസത്തിൽ അടയ്ക്കും` + (b.oldestUnpaidDays > 14 ? `, പക്ഷേ ഒരു ബിൽ ${b.oldestUnpaidDays} ദിവസമായി ബാക്കിയാണ്.` : ".");
}
