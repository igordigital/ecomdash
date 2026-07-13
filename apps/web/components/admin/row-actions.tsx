"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  archiveClientAction,
  assignUserClientAction,
  connectClientAccountAction,
  deleteClientAction,
  removeUserAction,
  runGa4NowAction,
  runGoogleAdsNowAction,
  runMetaNowAction,
  runWooNowAction,
  saveWooConnectionAction,
  type SaveWooState,
  unarchiveClientAction,
  updateClientBudgetAction,
} from "@/lib/admin-actions";
import { ConnectionStatusBadge } from "@/components/admin/ui";
import type { AdminClient, ConnectablePlatform, ConnectionStatus } from "@/lib/admin-store";
import { WOO_STATUS_OPTIONS } from "@/lib/woo-constants";

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

/** Flat recurring monthly ad-spend budget. Empty input clears it; the client's Run rate section then hides budget usage entirely. */
export function BudgetControl({ clientId, currentBudget }: { clientId: string; currentBudget: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentBudget != null ? String(currentBudget) : "");

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        const amount = trimmed === "" ? null : Number(trimmed);
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
        startTransition(async () => {
          await updateClientBudgetAction(clientId, amount);
          router.refresh();
        });
      }}
    >
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No budget set"
        className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 disabled:opacity-50"
      >
        Save
      </button>
    </form>
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

export interface ConnectAccountOption {
  externalId: string;
  name: string;
  secondary?: string;
}

/** Assigns one of the agency's already-authorized accounts/properties to this client. Reversible: "Change" reopens the picker. */
export function ConnectAccountControl({
  clientId,
  platform,
  label,
  current,
  options,
}: {
  clientId: string;
  platform: ConnectablePlatform;
  label: string;
  current: { externalId: string; name: string; status: ConnectionStatus } | null;
  options: ConnectAccountOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(!current);
  const [selected, setSelected] = useState(current?.externalId ?? options[0]?.externalId ?? "");

  if (!editing && current) {
    return (
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="text-slate-200">{current.name}</p>
          <p className="text-xs text-slate-500">{current.externalId}</p>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatusBadge status={current.status} />
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:underline">
            Change
          </button>
        </div>
      </div>
    );
  }

  if (options.length === 0) {
    return <p className="text-sm text-slate-500">No {label} authorized at the agency level yet.</p>;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
      >
        {options.map((o) => (
          <option key={o.externalId} value={o.externalId}>
            {o.name}
            {o.secondary ? ` · ${o.secondary}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !selected}
        onClick={() =>
          startTransition(async () => {
            await connectClientAccountAction(clientId, platform, selected);
            setEditing(false);
            router.refresh();
          })
        }
        className="shrink-0 rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 disabled:opacity-50"
      >
        Connect
      </button>
      {current ? (
        <button type="button" disabled={pending} onClick={() => setEditing(false)} className="shrink-0 text-xs text-slate-500 hover:underline">
          Cancel
        </button>
      ) : null}
    </div>
  );
}

const RUN_NOW_ACTIONS = {
  ga4: runGa4NowAction,
  meta: runMetaNowAction,
  woo: runWooNowAction,
  google: runGoogleAdsNowAction,
} as const;

/**
 * Processes pending ingest_jobs for this client + source right now, in
 * place of a real always-on worker (see lib/ga4-ingest.ts / lib/meta-ingest.ts).
 * Fire-and-forget on the server side, so this button returns immediately;
 * there's no live progress feed yet, so it just tells you to check back.
 */
export function RunSourceNowButton({
  clientId,
  source,
  label,
  disabled,
}: {
  clientId: string;
  source: keyof typeof RUN_NOW_ACTIONS;
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [started, setStarted] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            await RUN_NOW_ACTIONS[source](clientId);
            setStarted(true);
            router.refresh();
          })
        }
        className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 disabled:opacity-50"
      >
        {label}
      </button>
      {started ? <span className="text-xs text-slate-500">Started — reload in a bit to see progress.</span> : null}
    </div>
  );
}

const initialSaveWooState: SaveWooState = { ok: false };

/**
 * Unlike ConnectAccountControl, this isn't a picker over an agency-preauthorized
 * list: WooCommerce is per-client, so the site URL and consumer key/secret are
 * typed in directly here and tested live before saving (see saveWooConnectionAction).
 */
export function WooConnectControl({
  clientId,
  current,
}: {
  clientId: string;
  current: { domain: string; includedStatuses?: string[]; status: ConnectionStatus } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [statuses, setStatuses] = useState<string[]>(current?.includedStatuses ?? ["completed", "processing"]);
  const [state, formAction, pending] = useActionState(saveWooConnectionAction, initialSaveWooState);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  if (!editing && current) {
    return (
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="text-slate-200">WooCommerce · {current.domain}</p>
          {current.includedStatuses ? <p className="text-xs text-slate-500">Revenue statuses: {current.includedStatuses.join(", ")}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatusBadge status={current.status} />
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:underline">
            Update keys
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="grid gap-1 text-sm">
        <span className="text-slate-400">Site URL</span>
        <input
          name="siteUrl"
          defaultValue={current?.domain ?? ""}
          placeholder="https://mystore.com"
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-400">Consumer key</span>
          <input name="consumerKey" placeholder="ck_..." className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-400">Consumer secret</span>
          <input name="consumerSecret" type="password" placeholder="cs_..." className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        </label>
      </div>
      {current ? (
        <p className="text-[11px] text-slate-600">
          WooCommerce never lets us show you a saved secret again, so both fields are required every time you save here, even if
          you&apos;re only changing the revenue statuses below.
        </p>
      ) : null}
      <div>
        <p className="mb-1.5 text-sm text-slate-400">Order statuses that count toward revenue</p>
        <div className="flex flex-wrap gap-3">
          {WOO_STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                name="includedStatuses"
                value={opt.value}
                checked={statuses.includes(opt.value)}
                onChange={(e) => setStatuses((s) => (e.target.checked ? [...s, opt.value] : s.filter((v) => v !== opt.value)))}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="w-fit rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          {pending ? "Testing connection…" : "Save and test connection"}
        </button>
        {current ? (
          <button type="button" disabled={pending} onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
