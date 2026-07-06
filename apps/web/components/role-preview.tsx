"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Hidden for real Client-role sessions (they never see /admin), and also
 * hidden while an Admin/Analyst is previewing a client dashboard via the
 * ?preview=client overlay, so the preview reads as read-only.
 */
export function AdminLink({ sessionRole }: { sessionRole: "admin" | "analyst" | "client" }) {
  const params = useSearchParams();
  if (sessionRole === "client" || params.get("preview") === "client") return null;
  return (
    <Link
      href="/admin"
      className="rounded-md px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300"
    >
      Admin panel
    </Link>
  );
}

export function PreviewBanner() {
  const params = useSearchParams();
  if (params.get("preview") !== "client") return null;
  const name = params.get("client") ?? "this client";
  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-amber-900 bg-amber-950/60 px-4 py-2 text-sm text-amber-300">
      <span>
        Previewing as <strong>Client</strong> — {name} sees only this dashboard, read-only.
      </span>
      <Link href="/" className="text-xs underline hover:text-amber-200">
        Exit preview
      </Link>
    </div>
  );
}
