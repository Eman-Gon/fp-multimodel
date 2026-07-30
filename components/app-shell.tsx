"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  FileAudio2,
  Lightbulb,
  ListChecks,
  Menu,
  Network,
  Upload,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Ingest", href: null, Icon: Upload },
  { label: "Transcripts", href: null, Icon: FileAudio2 },
  { label: "Coding queue", href: "/queue", Icon: ListChecks },
  { label: "Graph", href: null, Icon: Network },
  { label: "Insights", href: null, Icon: Lightbulb },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Primary">
        <Link
          href="/"
          className="app-nav__mark"
          aria-label="Final Particle Lab home"
        >
          <Menu aria-hidden="true" />
        </Link>
        <div className="app-nav__items">
          {NAV_ITEMS.map(({ label, href, Icon }) => {
            const active =
              label === "Coding queue" &&
              (pathname.startsWith("/clips") || pathname.startsWith("/queue"));
            const content = (
              <>
                <Icon aria-hidden="true" strokeWidth={1.6} />
                <span>{label}</span>
              </>
            );

            return href === null ? (
              <span
                className="app-nav__item app-nav__item--disabled"
                aria-disabled="true"
                key={label}
                title={`${label} is outside this first Track C slice`}
              >
                {content}
              </span>
            ) : (
              <Link
                className={`app-nav__item${active ? " app-nav__item--active" : ""}`}
                href={href}
                aria-current={active ? "page" : undefined}
                key={label}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
