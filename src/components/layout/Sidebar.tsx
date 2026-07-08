"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coins,
  Gift,
  Gamepad2,
  Gem,
  Home,
  Shirt,
  Sprout,
  Users,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ProfileConnectActions } from "@/components/hub/ProfileConnectActions";
import { navItems } from "@/content/site";

const icons: Record<string, ReactNode> = {
  "/": <Home className="h-4 w-4" />,
  "/collections": <Gem className="h-4 w-4" />,
  "/staking": <Sprout className="h-4 w-4" />,
  "/games": <Gamepad2 className="h-4 w-4" />,
  "/merch": <Shirt className="h-4 w-4" />,
  "/hub": <Users className="h-4 w-4" />,
  "/empire-draw": <Gift className="h-4 w-4" />,
  "/bux": <Coins className="h-4 w-4" />,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-bg-elevated/95 backdrop-blur-md lg:flex">
      <div className="border-b border-border p-5">
        <BrandMark />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                active
                  ? "bg-accent-purple/15 text-foreground ring-1 ring-accent-purple/30"
                  : "text-muted hover:bg-bg-surface hover:text-foreground"
              }`}
            >
              <span className={active ? "text-accent-cyan" : ""}>{icons[item.href]}</span>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-[11px] text-muted">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="mb-3 text-[10px] uppercase tracking-wider text-muted">Profile</p>
        <ProfileConnectActions stacked />
      </div>
    </aside>
  );
}
