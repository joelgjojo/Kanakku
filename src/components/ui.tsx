"use client";
import clsx from "clsx";
import { Camera, Keyboard, LoaderCircle, MessageCircle, Mic, PenLine } from "lucide-react";
import type { Source } from "@/lib/types";
import { rupees } from "@/lib/format";

export function PageHeader({ title, ml, children }: { title: string; ml?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-4 lg:px-8 lg:pt-8">
      <div>
        <h1 className="sign text-[2rem] lg:text-[2.5rem]">{title}</h1>
        {ml && <p className="text-muted -mt-0.5">{ml}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const SOURCE: Record<Source, { icon: typeof Mic; label: string }> = {
  voice: { icon: Mic, label: "Voice" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  notebook: { icon: Camera, label: "Notebook photo" },
  manual: { icon: PenLine, label: "Typed in app" },
  text: { icon: Keyboard, label: "Text" },
};

export function SourceIcon({ source, size = 15 }: { source: Source; size?: number }) {
  const s = SOURCE[source] ?? SOURCE.manual;
  return (
    <span title={s.label} aria-label={s.label} className="inline-grid place-items-center text-muted">
      <s.icon size={size} />
    </span>
  );
}

export const Money = ({ value, className }: { value: number; className?: string }) => (
  <span className={clsx("num", className)}>{rupees(value)}</span>
);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" | "outline"; busy?: boolean };

export function Button({ variant = "primary", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 h-10 text-[0.95rem] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-pen text-white hover:bg-pen-dark",
        variant === "outline" && "border border-line bg-paper text-ink hover:bg-wall",
        variant === "quiet" && "text-pen hover:bg-pen-soft",
        variant === "danger" && "bg-due text-white hover:bg-margin",
        className,
      )}
    >
      {busy && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export const Spinner = ({ size = 18 }: { size?: number }) => <LoaderCircle size={size} className="animate-spin text-pen" />;

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg bg-due-soft px-3 py-2 text-sm text-due">{children}</p>;
}

export const inputCls =
  "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[0.95rem] text-ink placeholder:text-faint focus:border-pen focus:outline-none";

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; tone?: "due" }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-wall p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-9 rounded-md px-3.5 text-sm font-semibold transition-colors",
            value === o.value ? (o.tone === "due" ? "bg-due text-white" : "bg-paper text-ink shadow-[0_1px_0_var(--color-line)]") : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
