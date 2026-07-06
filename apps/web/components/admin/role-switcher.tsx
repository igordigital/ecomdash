"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setDemoRoleAction } from "@/lib/admin-actions";

/**
 * Demo-only role preview: there is no real auth session yet, so this just
 * flips a cookie the admin layout reads to gate Integrations and staff
 * management. Lets Igor see the Analyst boundary without building auth.
 */
export function RoleSwitcher({ role }: { role: "admin" | "analyst" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      Viewing as
      <select
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "admin" | "analyst";
          startTransition(async () => {
            await setDemoRoleAction(next);
            router.refresh();
          });
        }}
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200"
      >
        <option value="admin">Admin</option>
        <option value="analyst">Analyst</option>
      </select>
    </label>
  );
}
