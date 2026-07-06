"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startBackfillAction, type BackfillState } from "@/lib/admin-actions";

const initialState: BackfillState = { ok: false };

export function BackfillForm({
  clientId,
  sources,
  defaultStart,
  defaultEnd,
  minDate,
  maxDate,
  disabled,
}: {
  clientId: string;
  sources: string[];
  defaultStart: string;
  defaultEnd: string;
  minDate: string;
  maxDate: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startBackfillAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-xs text-slate-500">
        Sources included: {sources.length > 0 ? sources.join(", ") : "none connected yet"}. Loops one day at a time
        per source and upserts by grain, same as the daily job.
      </p>
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
          disabled={disabled || pending || sources.length === 0}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {pending ? "Queuing…" : "Start backfill"}
        </button>
      </div>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
    </form>
  );
}
