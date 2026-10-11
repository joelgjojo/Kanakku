"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, ErrorNote, inputCls } from "@/components/ui";
import { useLang } from "@/lib/i18n";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }).catch(() => null);
    if (res?.ok) {
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return;
    }
    setBusy(false);
    setPin("");
    setErr(res ? t("Wrong PIN. Try again.", "PIN തെറ്റാണ്. വീണ്ടും ശ്രമിക്കൂ.") : t("No internet.", "നെറ്റ് ഇല്ല."));
  };

  return (
    <div className="min-h-[80dvh] grid place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-pen">
          <Lock size={18} />
          <span className="text-sm font-semibold">{t("This shop's accounts are locked", "ഈ കടയുടെ കണക്ക് പൂട്ടിയിരിക്കുന്നു")}</span>
        </div>
        <h1 className="sign text-3xl">{t("Enter the shop PIN", "കടയുടെ PIN നൽകൂ")}</h1>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className={`${inputCls} h-12 text-center text-2xl tracking-[0.4em] num`}
          aria-label={t("Shop PIN", "കടയുടെ PIN")}
        />
        <ErrorNote>{err}</ErrorNote>
        <Button type="submit" busy={busy} disabled={!pin} className="w-full h-12 text-base">{t("Open", "തുറക്കൂ")}</Button>
        <p className="text-xs text-muted">{t("Customers' pattu pages stay open to them without the PIN.", "ഉപഭോക്താക്കളുടെ പറ്റ് പേജ് PIN ഇല്ലാതെ അവർക്ക് കാണാം.")}</p>
      </form>
    </div>
  );
}
