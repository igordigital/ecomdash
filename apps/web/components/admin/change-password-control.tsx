"use client";

import { useActionState, useEffect, useState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/lib/admin-actions";

const initialState: ChangePasswordState = { ok: false };

export function ChangePasswordControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-sky-400 hover:underline">
        Change password
      </button>
    );
  }

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-1.5">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="New password"
          autoFocus
          className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
      {state.error ? <p className="text-xs text-red-400">{state.error}</p> : null}
    </form>
  );
}
