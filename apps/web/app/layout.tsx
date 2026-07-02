import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ecomdash",
  description: "E-commerce control dashboard: blended MER, campaign health, site traffic",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#0b0e14",
          color: "#e6e6e6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
