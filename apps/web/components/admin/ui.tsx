import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { BackfillStatus, ConnectionStatus } from "@/lib/admin-store";

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") return <Badge tone="good">Connected</Badge>;
  if (status === "needs_reauth") return <Badge tone="bad">Needs reauth</Badge>;
  return <Badge tone="neutral">Not connected</Badge>;
}

const BACKFILL_META: Record<BackfillStatus, { label: string; tone: "neutral" | "info" | "warn" | "good" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  queued: { label: "Queued", tone: "info" },
  running: { label: "Backfilling", tone: "warn" },
  complete: { label: "Backfill complete", tone: "good" },
};

export function BackfillBadge({ status }: { status: BackfillStatus }) {
  const m = BACKFILL_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function AdminPageHeader({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>
      </div>
      {right}
    </div>
  );
}
