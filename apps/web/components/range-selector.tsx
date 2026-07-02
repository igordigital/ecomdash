"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResolvedRange } from "../lib/range";

const PRESETS: { key: "1d" | "7d" | "30d"; label: string }[] = [
  { key: "1d", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

function pillClass(active: boolean) {
  return `rounded px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
  }`;
}

/**
 * Global date range control. Presets are plain links (work without JS,
 * prefetchable); custom range needs local state for the two date inputs
 * before pushing the URL. `pathname` is passed in rather than read via
 * usePathname so this component needs no Suspense boundary.
 */
export function RangeSelector({
  current,
  pathname,
  earliestDate,
  latestDate,
}: {
  current: ResolvedRange;
  pathname: string;
  earliestDate: string;
  latestDate: string;
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(current.key === "custom");
  const [from, setFrom] = useState(current.key === "custom" ? current.start : "");
  const [to, setTo] = useState(current.key === "custom" ? current.end : "");

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    router.push(`${pathname}?range=custom&from=${from}&to=${to}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-slate-800 bg-slate-900/60 p-0.5">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`${pathname}?range=${p.key}`}
            onClick={() => setShowCustom(false)}
            className={pillClass(current.key === p.key)}
          >
            {p.label}
          </Link>
        ))}
        <button type="button" onClick={() => setShowCustom((v) => !v)} className={pillClass(current.key === "custom")}>
          Custom
        </button>
      </div>
      {showCustom ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            min={earliestDate}
            max={to || latestDate}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300"
          />
          <span className="text-xs text-slate-600">to</span>
          <input
            type="date"
            value={to}
            min={from || earliestDate}
            max={latestDate}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
