"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startBackfillAction, type BackfillState } from "@/lib/admin-actions";
import { BackfillBadge } from "@/components/admin/ui";
import type { BackfillSourceKey, BackfillStatus } from "@/lib/admin-store";

const initialState: BackfillState = { ok: false };

export interface BackfillSourceRow {
  key: BackfillSourceKey;
  label: string;
  connected: boolean;
  connectionNote?: string; // e.g. "not connected", "needs reauthorization"
  status: BackfillStatus;
  range: { start: string; end: string } | null;
}

export function BackfillForm({
  clientId,
  sources,
  defaultStart,
  defaultEnd,
  minDate,
  maxDate,
}: {
  clientId: string;
  sources: BackfillSourceRow[];
  defaultStart: string;
  defaultEnd: string;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startBackfillAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  // Gated only on whether a source is connected at all -- backfill status (queued/running/etc)
  // is informational, not a submission gate. startBackfillAction always accepts and immediately
  // runs a new request regardless of what else is in flight for that source (see its docstring).
  const anySelectable = sources.some((s) => s.connected);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />

      <div className="grid gap-2">
        {sources.map((s) => {
          const selectable = s.connected;
          return (
            <label
              key={s.key}
              className={`flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2 text-sm ${
                selectable ? "" : "opacity-50"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  name="sources"
                  value={s.key}
                  defaultChecked={selectable}
                  disabled={!selectable}
                  className="h-4 w-4"
                />
                <span className="font-medium text-slate-200">{s.label}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {s.range ? (
                  <span>
                    {s.range.start} – {s.range.end}
                  </span>
                ) : null}
                {s.connected ? <BackfillBadge status={s.status} /> : <span>{s.connectionNote ?? "not connected"}</span>}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs">
          <span className="text-slate-400">Start date</span>
          <input
            type="date"
            name="start"
            defaultValue={defaultStart}
            min={minDate}
            max={maxDate}
            required
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-slate-400">End date</span>
          <input
            type="date"
            name="end"
            defaultValue={defaultEnd}
            min={minDate}
            max={maxDate}
            required
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={!anySelectable || pending}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {pending ? "Starting…" : "Start backfill"}
        </button>
      </div>

      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.ok && state.message ? <p className="text-sm text-amber-400">{state.message}</p> : null}
    </form>
  );
}
