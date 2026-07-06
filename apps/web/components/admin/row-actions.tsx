"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { assignUserClientAction, removeUserAction } from "@/lib/admin-actions";
import type { AdminClient } from "@/lib/admin-store";

export function AssignClientSelect({
  userId,
  clientId,
  clients,
}: {
  userId: string;
  clientId: string | null;
  clients: AdminClient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={clientId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await assignUserClientAction(userId, next);
          router.refresh();
        });
      }}
      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
    >
      <option value="">Unassigned</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function RemoveUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeUserAction(userId);
          router.refresh();
        })
      }
      className="text-xs text-red-400 hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}
