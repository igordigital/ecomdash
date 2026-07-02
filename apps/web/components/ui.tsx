import type { ReactNode } from "react";

export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      {title ? <h2 className="text-sm font-semibold text-slate-200">{title}</h2> : null}
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${accent ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "good" | "bad" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-800 text-slate-300",
    warn: "bg-amber-950 text-amber-400 border border-amber-900",
    good: "bg-emerald-950 text-emerald-400 border border-emerald-900",
    bad: "bg-red-950 text-red-400 border border-red-900",
    info: "bg-sky-950 text-sky-400 border border-sky-900",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, right }: { title: string; description: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>
      </div>
      {right}
    </div>
  );
}

export function PlatformDot({ platform }: { platform: "meta" | "google" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-300">
      <span
        className={`h-2 w-2 rounded-full ${platform === "meta" ? "bg-sky-400" : "bg-emerald-400"}`}
      />
      {platform === "meta" ? "Meta" : "Google"}
    </span>
  );
}
