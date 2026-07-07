import type { ReactNode } from "react";
import type { FunnelStage, Health, RollingPoint } from "../lib/dashboard-data";
import { fmtNumCompact, fmtPct } from "../lib/format";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-900/40 p-5 ${className}`}>
      {title ? <h2 className="text-sm font-semibold text-slate-200">{title}</h2> : null}
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mt-8 mb-3 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{children}</h2>
      {hint ? <p className="mt-0.5 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

/** Server-rendered SVG sparkline; no client JS. */
export function Sparkline({
  values,
  color = "#38bdf8",
  width = 96,
  height = 34,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = height - 3 - (((values.at(-1) ?? min) - min) / span) * (height - 6);
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

/**
 * Delta vs prior period. invert=true means lower is better (costs, bounce,
 * refund rate), so a drop renders green.
 */
export function Delta({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const near = Math.abs(pct) < 0.5;
  const color = near ? "text-slate-500" : good ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  current,
  previous,
  invert,
  spark,
  sparkColor,
  hint,
  accent,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  invert?: boolean;
  spark?: number[];
  sparkColor?: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <p className={`text-2xl font-bold tabular-nums ${accent ? "text-emerald-400" : "text-slate-100"}`}>
            {value}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {current !== undefined && previous !== undefined ? (
              <Delta current={current} previous={previous} invert={invert} />
            ) : null}
            {hint ? <span className="text-[11px] text-slate-600">{hint}</span> : null}
          </div>
        </div>
        {spark ? <Sparkline values={spark} color={sparkColor ?? "#38bdf8"} /> : null}
      </div>
    </div>
  );
}

/**
 * Always-visible 1D / 7D / 30D snapshot for a north-star metric, independent
 * of the page's range selector. Anchored to the latest complete day.
 */
export function MultiWindowStat({
  label,
  points,
  spark,
  format,
  invert,
  sparkColor = "#38bdf8",
}: {
  label: string;
  points: RollingPoint[];
  spark: number[];
  format: (n: number) => string;
  invert?: boolean;
  sparkColor?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <Sparkline values={spark} color={sparkColor} width={64} height={22} />
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-slate-800">
        {points.map((p) => (
          <div key={p.key} className="px-2.5 first:pl-0 last:pr-0">
            <p className="text-[10px] font-medium text-slate-600">{p.label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">{format(p.value)}</p>
            <Delta current={p.value} previous={p.previous} invert={invert} />
          </div>
        ))}
      </div>
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
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const HEALTH_META: Record<Health, { label: string; tone: "info" | "good" | "warn" | "bad" }> = {
  scaling: { label: "Scaling", tone: "info" },
  healthy: { label: "Healthy", tone: "good" },
  watch: { label: "Watch", tone: "warn" },
  fatigued: { label: "Fatigued", tone: "bad" },
  inefficient: { label: "Inefficient", tone: "bad" },
};

export function HealthChip({ health }: { health: Health }) {
  const m = HEALTH_META[health];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function StockChip({ stock }: { stock: "in_stock" | "low_stock" | "out_of_stock" }) {
  if (stock === "in_stock") return <Badge tone="good">In stock</Badge>;
  if (stock === "low_stock") return <Badge tone="warn">Low stock</Badge>;
  return <Badge tone="bad">Out of stock</Badge>;
}

export function PageHeader({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
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
      <span className={`h-2 w-2 rounded-full ${platform === "meta" ? "bg-sky-400" : "bg-emerald-400"}`} />
      {platform === "meta" ? "Meta" : "Google"}
    </span>
  );
}

/**
 * Funnel with square-root scaled bar widths (raw ratios would make lower
 * stages invisible); the printed step percentages carry the real numbers.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const first = stages[0]?.value ?? 1;
  return (
    <div className="grid gap-2">
      {stages.map((s, i) => {
        const prevStage = i > 0 ? stages[i - 1] : null;
        const stepRate = prevStage && prevStage.value > 0 ? s.value / prevStage.value : null;
        const widthPct = Math.max(Math.sqrt(s.value / Math.max(first, 1)) * 100, 3);
        return (
          <div key={s.label} className="flex items-center gap-3">
            <p className="w-36 shrink-0 text-xs text-slate-400">{s.label}</p>
            <div className="min-w-0 flex-1">
              <div
                className="h-7 rounded bg-gradient-to-r from-sky-500/70 to-emerald-500/70"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <div className="flex w-44 shrink-0 items-baseline justify-end gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-200">
                {fmtNumCompact(s.value)}
              </span>
              {stepRate !== null ? (
                <span className="text-[11px] tabular-nums text-slate-500">{fmtPct(stepRate)} of prev</span>
              ) : null}
              <Delta current={s.value} previous={s.prev} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal share bar, e.g. spend split by platform or creative type. */
export function ShareBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded">
        {items.map((i) => (
          <div key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {items.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
            {i.label} {fmtPct(i.value / total)}
          </span>
        ))}
      </div>
    </div>
  );
}
