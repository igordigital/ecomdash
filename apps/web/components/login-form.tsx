"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/admin-actions";

const initialState: LoginState = { ok: false };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Email</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Password</span>
        <input
          name="password"
          type="password"
          required
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
