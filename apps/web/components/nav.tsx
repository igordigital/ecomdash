"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-slate-800 font-medium text-slate-100"
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
