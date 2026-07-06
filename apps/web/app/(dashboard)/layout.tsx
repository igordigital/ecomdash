import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Nav, NavFallback } from "@/components/nav";
import { AdminLink, PreviewBanner } from "@/components/role-preview";
import { Badge } from "@/components/ui";
import { logoutAction } from "@/lib/admin-actions";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getClient } from "@/lib/admin-store";
import { DEMO_CLIENT } from "@/lib/mock";
import "../globals.css";

export const metadata: Metadata = {
  title: "ecomdash",
  description: "E-commerce control dashboard: blended MER, campaign health, site traffic",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  const clientName =
    session?.role === "client" ? (getClient(session.clientId ?? "")?.name ?? DEMO_CLIENT.name) : DEMO_CLIENT.name;

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col border-b border-slate-800 p-4 md:w-56 md:border-r md:border-b-0">
            <div className="mb-4 flex items-center justify-between gap-2 px-1 md:mb-6 md:block md:px-3">
              <p className="text-sm font-bold text-slate-100">ecomdash</p>
              <div className="flex items-center gap-2 md:mt-2">
                <p className="text-xs text-slate-400">{clientName}</p>
                <Badge tone="warn">Demo data</Badge>
              </div>
            </div>
            <Suspense fallback={<NavFallback />}>
              <Nav />
            </Suspense>
            <div className="mt-auto flex flex-col gap-2 pt-4">
              <Suspense fallback={null}>
                <AdminLink sessionRole={session?.role ?? "client"} />
              </Suspense>
              {session ? (
                <>
                  <p className="truncate px-3 text-xs text-slate-600">{session.name}</p>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                    >
                      Log out
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">
            <Suspense fallback={null}>
              <PreviewBanner />
            </Suspense>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
