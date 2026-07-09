import Link from "next/link";
import { AdminPageHeader, JobStatusBadge } from "@/components/admin/ui";
import { LogFilters } from "@/components/admin/log-filters";
import { Card } from "@/components/ui";
import {
  INGEST_LOG_PAGE_SIZE,
  getClients,
  getIngestJobLog,
  getIngestJobSources,
  type IngestJobKind,
  type IngestJobStatus,
} from "@/lib/admin-store";

interface LogSearchParams {
  clientId?: string;
  source?: string;
  status?: string;
  kind?: string;
  page?: string;
}

const STATUS_VALUES: IngestJobStatus[] = ["pending", "running", "succeeded", "failed"];
const KIND_VALUES: IngestJobKind[] = ["backfill", "daily"];

export default async function LogsPage({ searchParams }: { searchParams: Promise<LogSearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUS_VALUES.includes(sp.status as IngestJobStatus) ? (sp.status as IngestJobStatus) : undefined;
  const kind = KIND_VALUES.includes(sp.kind as IngestJobKind) ? (sp.kind as IngestJobKind) : undefined;

  const [clients, sources, { rows, total }] = await Promise.all([
    getClients(),
    getIngestJobSources(),
    getIngestJobLog({ clientId: sp.clientId || undefined, source: sp.source || undefined, status, kind, page }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / INGEST_LOG_PAGE_SIZE));
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (sp.clientId) params.set("clientId", sp.clientId);
    if (sp.source) params.set("source", sp.source);
    if (status) params.set("status", status);
    if (kind) params.set("kind", kind);
    params.set("page", String(targetPage));
    return `/admin/logs?${params.toString()}`;
  };

  return (
    <>
      <AdminPageHeader
        title="Logs"
        description="Every API pull attempt across every client, source, and day, newest first — for debugging a stuck, failed, or slow sync."
      />

      <Card>
        <LogFilters
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          sources={sources}
          current={{ clientId: sp.clientId, source: sp.source, status, kind }}
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Client</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Kind</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Attempts</th>
                <th className="pb-2 pr-4 font-medium">Started</th>
                <th className="pb-2 pr-4 font-medium">Finished</th>
                <th className="pb-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => (
                <tr key={r.id} className="text-slate-300">
                  <td className="py-2.5 pr-4">
                    <Link href={`/admin/clients/${r.clientId}`} className="font-medium text-slate-200 hover:underline">
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{r.source}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-slate-300">{r.date}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{r.kind}</td>
                  <td className="py-2.5 pr-4">
                    <JobStatusBadge status={r.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.attempts}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "—"}</td>
                  <td className="max-w-xs truncate py-2.5 text-xs text-red-400" title={r.lastError ?? undefined}>
                    {r.lastError ?? "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-slate-500">
                    No jobs match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <p>
            {total.toLocaleString()} total{total > 0 ? ` · page ${page} of ${totalPages}` : ""}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="rounded border border-slate-700 px-2.5 py-1 hover:border-slate-600">
                Previous
              </Link>
            ) : (
              <span className="rounded border border-slate-800 px-2.5 py-1 opacity-40">Previous</span>
            )}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="rounded border border-slate-700 px-2.5 py-1 hover:border-slate-600">
                Next
              </Link>
            ) : (
              <span className="rounded border border-slate-800 px-2.5 py-1 opacity-40">Next</span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
