"use client";

import { useRouter } from "next/navigation";

export interface LogFiltersValue {
  clientId?: string;
  source?: string;
  status?: string;
  kind?: string;
}

const STATUS_OPTIONS = ["pending", "running", "succeeded", "failed"];
const KIND_OPTIONS = ["backfill", "daily"];

const SELECT_CLASS = "rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200";

/** Changing any filter drops the page param (not carried in `current`), so a new filter always starts back at page 1. */
export function LogFilters({
  clients,
  sources,
  current,
}: {
  clients: { id: string; name: string }[];
  sources: string[];
  current: LogFiltersValue;
}) {
  const router = useRouter();

  const update = (key: keyof LogFiltersValue, value: string) => {
    const next = { ...current, [key]: value || undefined };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    router.push(`/admin/logs${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={current.clientId ?? ""} onChange={(e) => update("clientId", e.target.value)} className={SELECT_CLASS}>
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={current.source ?? ""} onChange={(e) => update("source", e.target.value)} className={SELECT_CLASS}>
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={current.status ?? ""} onChange={(e) => update("status", e.target.value)} className={SELECT_CLASS}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={current.kind ?? ""} onChange={(e) => update("kind", e.target.value)} className={SELECT_CLASS}>
        <option value="">All kinds</option>
        {KIND_OPTIONS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      {current.clientId || current.source || current.status || current.kind ? (
        <button type="button" onClick={() => router.push("/admin/logs")} className="text-xs text-slate-500 hover:underline">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
