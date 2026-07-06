"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { inviteUserAction, type InviteUserState } from "@/lib/admin-actions";
import type { AdminClient, Role } from "@/lib/admin-store";

const initialState: InviteUserState = { ok: false };

export function InviteUserForm({ clients, canInviteStaff }: { clients: AdminClient[]; canInviteStaff: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("client");
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      setRole("client");
      router.refresh();
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
      >
        Invite user
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mb-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-[1fr_1fr_auto_auto]"
    >
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Name</span>
        <input name="name" required className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Email</span>
        <input
          name="email"
          type="email"
          required
          className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Role</span>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
        >
          <option value="client">Client</option>
          {canInviteStaff ? <option value="analyst">Analyst</option> : null}
          {canInviteStaff ? <option value="admin">Admin</option> : null}
        </select>
      </label>
      {role === "client" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-slate-400">Client</span>
          <select name="clientId" required className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100">
            <option value="">Select...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div />
      )}

      {state.error ? <p className="col-span-full text-sm text-red-400">{state.error}</p> : null}

      <div className="col-span-full flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Send invite"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
