"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Lets Admin/Analyst sessions jump between client dashboards without going
 * back through /admin each time, preserving whichever page they're on
 * (Store, Meta, etc.) across the switch. `clients` is only ever populated
 * server-side for staff sessions (see (dashboard)/layout.tsx) so a real
 * Client-role session never receives the other clients' names, even in
 * the page payload.
 */
export function ClientSwitcher({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (clients.length === 0) return null;

  const currentClientId = params.get("clientId") ?? "";

  return (
    <select
      value={currentClientId}
      onChange={(e) => {
        const next = clients.find((c) => c.id === e.target.value);
        const qs = new URLSearchParams(params.toString());
        if (next) {
          qs.set("preview", "client");
          qs.set("clientId", next.id);
          qs.set("client", next.name);
        } else {
          qs.delete("preview");
          qs.delete("clientId");
          qs.delete("client");
        }
        const query = qs.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
    >
      <option value="">Agency view (demo data)</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
