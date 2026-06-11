"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coins,
  Gamepad2,
  Gem,
  Home,
  MoreHorizontal,
  Shirt,
  Sprout,
  Users,
} from "lucide-react";
import { navItems } from "@/content/site";

const mobileNav = navItems.slice(0, 4);
const moreNav = navItems.slice(4);

const icons: Record<string, ReactNode> = {
  "/": <Home className="h-5 w-5" />,
  "/collections": <Gem className="h-5 w-5" />,
  "/staking": <Sprout className="h-5 w-5" />,
  "/games": <Gamepad2 className="h-5 w-5" />,
  "/merch": <Shirt className="h-5 w-5" />,
  "/hub": <Users className="h-5 w-5" />,
  "/bux": <Coins className="h-5 w-5" />,
};

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[var(--bottom-nav-height)] items-center justify-around border-t border-border bg-bg-elevated/95 px-2 backdrop-blur-md lg:hidden">
      {mobileNav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 ${
              active ? "text-accent-cyan" : "text-muted"
            }`}
          >
            {icons[item.href]}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <details className="relative">
        <summary className="flex cursor-pointer list-none flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-muted">
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
        </summary>
        <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-border bg-bg-panel p-2 shadow-xl">
          {moreNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                pathname === item.href
                  ? "bg-accent-purple/15 text-foreground"
                  : "text-muted hover:bg-bg-surface"
              }`}
            >
              {icons[item.href]}
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
