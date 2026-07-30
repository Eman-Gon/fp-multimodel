"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FileAudio2, LibraryBig, ListChecks } from "lucide-react";
import { DEMO_CLIP_ID } from "@/lib/track-c/seed.ts";

const NAV_ITEMS = [
  { label: "Queue", href: "/queue", Icon: ListChecks },
  { label: "Explore", href: "/explore", Icon: LibraryBig },
  {
    label: "Review clip",
    href: `/clips/${DEMO_CLIP_ID}`,
    Icon: FileAudio2,
  },
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
          prefetch={false}
        >
          <span lang="zh-Hans" aria-hidden="true">
            吗
          </span>
        </Link>
        <div className="app-nav__items">
          {NAV_ITEMS.map(({ label, href, Icon }) => {
            const active =
              href === "/queue"
                ? pathname === "/" || pathname.startsWith("/queue")
                : href === "/explore"
                  ? pathname.startsWith("/explore")
                  : pathname.startsWith("/clips");

            return (
              <Link
                className={`app-nav__item${active ? " app-nav__item--active" : ""}`}
                href={href}
                aria-current={active ? "page" : undefined}
                key={label}
                prefetch={false}
              >
                <Icon aria-hidden="true" strokeWidth={1.6} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
        <p className="app-nav__mode">
          <span aria-hidden="true" />
          Demo
        </p>
      </nav>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
