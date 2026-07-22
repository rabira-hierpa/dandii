"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BankNote02,
  CheckDone01,
  DotsVertical,
  Grid01,
  LineChartUp01,
  Map01,
  Route as RouteIcon,
} from "@untitledui/icons";
import { authClient } from "@/lib/auth-client";
import { cx } from "@/utils/cx";

export const MOBILE_TABS = [
  { href: "/console", label: "Overview", icon: Grid01 },
  { href: "/console/routes", label: "Routes", icon: RouteIcon },
  { href: "/console/network", label: "Network", icon: Map01 },
  { href: "/console/fares", label: "Fares", icon: BankNote02 },
  { href: "/console/proposals", label: "Review", icon: CheckDone01 },
  { href: "/console/analytics", label: "Analytics", icon: LineChartUp01 },
];

interface ConsoleMobileNavProps {
  user: { name: string; email: string; role: string };
  canManageSettings: boolean;
  pendingProposals: number;
}

/**
 * Mobile console chrome: fixed dark top bar (brand, role, overflow menu)
 * and a fixed bottom tab bar for the sections. Hidden on ≥sm where the
 * sidebar takes over.
 */
export function ConsoleMobileNav({
  user,
  canManageSettings,
  pendingProposals,
}: ConsoleMobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="sm:hidden print:hidden">
      {/* Top app bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 bg-[#152018] px-4 py-3 text-[#E8ECE6]">
        <Link href="/console" className="min-w-0 flex-1">
          <div className="truncate text-[14px] leading-tight font-bold">
            Addis Ababa Transit
          </div>
          <div className="text-[10.5px] text-[#93A695]">Operations Console</div>
        </Link>
        <span className="rounded-full bg-[#24352A] px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-[#9DD5AB] uppercase">
          {user.role}
        </span>
        <div ref={menuRef} className="relative">
          <button
            aria-label="Console menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-[#24352A]"
          >
            <DotsVertical className="size-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-50 mt-1.5 flex w-56 flex-col rounded-xl bg-white py-1.5 text-[#1C2321] shadow-xl ring-1 ring-black/10">
              <div className="border-b border-[#EEF1EA] px-3.5 pt-1 pb-2.5">
                <div className="truncate text-[13px] font-semibold">
                  {user.name}
                </div>
                <div className="truncate text-[11.5px] text-[#5C6B5E]">
                  {user.email}
                </div>
              </div>
              <Link
                href="/"
                className="px-3.5 py-2.5 text-[13px] font-medium hover:bg-[#F4F5F2]"
                onClick={() => setMenuOpen(false)}
              >
                View public map
              </Link>
              {canManageSettings && (
                <Link
                  href="/settings"
                  className="px-3.5 py-2.5 text-[13px] font-medium hover:bg-[#F4F5F2]"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
              )}
              <button
                onClick={signOut}
                className="cursor-pointer px-3.5 py-2.5 text-left text-[13px] font-medium hover:bg-[#F4F5F2]"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#2A3A2E] bg-[#152018] pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map((tab) => {
          const active =
            tab.href === "/console"
              ? pathname === "/console"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cx(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold",
                active ? "text-[#9DD5AB]" : "text-[#7E9182]",
              )}
            >
              <span className="relative">
                <Icon className="size-5.5" />
                {tab.href === "/console/proposals" && pendingProposals > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[9.5px] font-bold text-white ring-2 ring-[#152018]">
                    {pendingProposals}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
