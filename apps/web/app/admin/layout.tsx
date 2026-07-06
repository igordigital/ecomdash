import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/admin-actions";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { canManageIntegrations, type StaffRole } from "@/lib/admin-permissions";
import "../globals.css";

export const metadata: Metadata = {
  title: "ecomdash — Admin",
  description: "Multi-tenant admin panel: client onboarding, platform connections, user management",
};

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/integrations", label: "Integrations", adminOnly: true },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  // middleware guarantees a non-client session reaches here; this is a type-narrowing fallback, not a security boundary.
  const role: StaffRole = session?.role === "admin" ? "admin" : "analyst";

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col border-b border-slate-800 p-4 md:w-56 md:border-r md:border-b-0">
            <div className="mb-6 px-1 md:px-3">
              <p className="text-sm font-bold text-slate-100">ecomdash</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-slate-400">Admin panel</p>
                <Badge tone="info">{role === "admin" ? "Admin" : "Analyst"}</Badge>
              </div>
            </div>
            <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
              {LINKS.filter((l) => !l.adminOnly || canManageIntegrations(role)).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-slate-800 pt-4">
              <p className="truncate px-1 text-xs text-slate-500">{session?.name ?? "Unknown user"}</p>
              <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
                View client dashboards
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
                  Log out
                </button>
              </form>
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
