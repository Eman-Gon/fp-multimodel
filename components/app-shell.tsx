"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bot, LibraryBig, ListChecks } from "lucide-react";

const NAV_ITEMS = [
  { label: "Queue", href: "/queue", Icon: ListChecks },
  { label: "Reviewed", href: "/explore", Icon: LibraryBig },
  {
    label: "AI Setup",
    href: "/integrations/twelvelabs",
    Icon: Bot,
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
                ? pathname === "/" ||
                  pathname.startsWith("/queue") ||
                  pathname.startsWith("/clips")
                : pathname === href || pathname.startsWith(`${href}/`);

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
        <p
          className="app-nav__mode"
          title="Simulated annotations for product demonstration only"
        >
          <span aria-hidden="true" />
          Demo data
        </p>
      </nav>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
