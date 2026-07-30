import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "Final Particle Lab",
  description:
    "Human review workspace for Mandarin sentence-final-particle gesture coding.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

