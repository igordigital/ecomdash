import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Nav, NavFallback } from "../components/nav";
import { Badge } from "../components/ui";
import { DEMO_CLIENT } from "../lib/mock";
import "./globals.css";

export const metadata: Metadata = {
  title: "ecomdash",
  description: "E-commerce control dashboard: blended MER, campaign health, site traffic",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="shrink-0 border-b border-slate-800 p-4 md:w-56 md:border-r md:border-b-0">
            <div className="mb-4 flex items-center justify-between gap-2 px-1 md:mb-6 md:block md:px-3">
              <p className="text-sm font-bold text-slate-100">ecomdash</p>
              <div className="flex items-center gap-2 md:mt-2">
                <p className="text-xs text-slate-400">{DEMO_CLIENT.name}</p>
                <Badge tone="warn">Demo data</Badge>
              </div>
            </div>
            <Suspense fallback={<NavFallback />}>
              <Nav />
            </Suspense>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
