"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/store", label: "Store" },
  { href: "/funnel", label: "Funnel" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/meta", label: "Meta" },
  { href: "/google", label: "Google" },
  { href: "/traffic", label: "Site traffic" },
  { href: "/anomalies", label: "Anomalies" },
];

function linkClass(active: boolean) {
  return `rounded-md px-3 py-2 text-sm transition-colors ${
    active ? "bg-slate-800 font-medium text-slate-100" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
  }`;
}

/** Preserves the current range selection (?range=...) when switching pages. */
export function Nav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={qs ? `${href}?${qs}` : href} className={linkClass(pathname === href)}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Suspense fallback for Nav (useSearchParams requires a boundary); no query passthrough on first paint. */
export function NavFallback() {
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={linkClass(false)}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
