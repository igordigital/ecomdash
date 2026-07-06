import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";

export const metadata: Metadata = {
  title: "ecomdash — Sign in",
  description: "Sign in to the e-commerce control dashboard",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center p-6">{children}</div>
      </body>
    </html>
  );
}
