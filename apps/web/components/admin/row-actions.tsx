"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveClientAction,
  assignUserClientAction,
  deleteClientAction,
  removeUserAction,
  unarchiveClientAction,
} from "@/lib/admin-actions";
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

export function RemoveUserButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${userName}? They will no longer be able to sign in.`)) return;
        startTransition(async () => {
          await removeUserAction(userId);
          router.refresh();
        });
      }}
      className="text-xs text-red-400 hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}

/** Archiving stops future sync (backfill/daily) but keeps all historical data; reversible. */
export function ArchiveClientToggle({ clientId, status }: { clientId: string; status: "active" | "archived" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const willArchive = status === "active";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (willArchive && !window.confirm("Archive this client? It will stop syncing new data. All historical data is kept, and you can unarchive it later.")) {
          return;
        }
        startTransition(async () => {
          if (willArchive) await archiveClientAction(clientId);
          else await unarchiveClientAction(clientId);
          router.refresh();
        });
      }}
      className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 disabled:opacity-50"
    >
      {willArchive ? "Archive" : "Unarchive"}
    </button>
  );
}

/**
 * Permanent, irreversible delete: purges the client and every row keyed to
 * it (spend, orders, traffic, campaigns, backfill history). Requires typing
 * the client's name to confirm, given the blast radius is much larger than
 * removing a user.
 */
export function DeleteClientControl({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText.trim() === clientName;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-900/60 px-2.5 py-1 text-xs font-medium text-red-400 hover:border-red-700"
      >
        Delete client…
      </button>
    );
  }

  return (
    <div className="rounded border border-red-900/60 bg-red-950/20 p-3">
      <p className="text-xs text-red-300">
        This permanently deletes {clientName} and all of its data: ad spend, orders, traffic, campaigns, and backfill
        history. This cannot be undone.
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Type <span className="font-semibold text-slate-200">{clientName}</span> to confirm.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={clientName}
          disabled={pending}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
        />
        <button
          type="button"
          disabled={!matches || pending}
          onClick={() => startTransition(async () => deleteClientAction(clientId))}
          className="shrink-0 rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete permanently
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setConfirmText("");
          }}
          className="shrink-0 text-xs text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
