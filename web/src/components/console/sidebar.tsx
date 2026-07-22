"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cx } from "@/utils/cx";

const NAV_ITEMS = [
  { href: "/console", label: "Agency Overview", dot: "#D97706" },
  { href: "/console/routes", label: "Route Assignment", dot: "#15803D" },
  { href: "/console/network", label: "Network Map", dot: "#0F766E" },
  { href: "/console/fares", label: "Fare Management", dot: "#1D4ED8" },
  { href: "/console/proposals", label: "Fare Review", dot: "#DC2626" },
  { href: "/console/feeds", label: "Feed Versions", dot: "#0891B2" },
  { href: "/console/analytics", label: "Analytics", dot: "#9333EA" },
];

interface ConsoleSidebarProps {
  user: { name: string; email: string; role: string };
  canManageSettings: boolean;
  pendingProposals: number;
}

export function ConsoleSidebar({
  user,
  canManageSettings,
  pendingProposals,
}: ConsoleSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <aside className="sticky top-0 flex h-screen w-59 shrink-0 flex-col bg-[#152018] px-4 py-6 text-[#E8ECE6] max-sm:hidden print:hidden">
      <div className="border-b border-[#2A3A2E] px-2 pb-6">
        <Link href="/" className="block">
          <div className="text-[15px] font-bold tracking-wide">
            Addis Ababa Transit
          </div>
          <div className="mt-0.5 text-xs text-[#93A695]">
            Network Operations Console
          </div>
        </Link>
      </div>

      <nav className="mt-5 flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/console"
              ? pathname === "/console"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                active
                  ? "bg-[#2E4436] text-white"
                  : "text-[#B8C4B8] hover:bg-[#24352A]",
              )}
            >
              <span
                className="size-[9px] shrink-0 rounded-[3px]"
                style={{ background: item.dot }}
              />
              {item.label}
              {item.href === "/console/proposals" && pendingProposals > 0 && (
                <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                  {pendingProposals}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-[#2A3A2E] pt-4">
        <div className="px-2">
          <div className="truncate text-[13px] font-semibold text-[#E8ECE6]">
            {user.name}
          </div>
          <div className="truncate text-[11.5px] text-[#93A695]">
            {user.email}
          </div>
          <div className="mt-1 inline-block rounded-full bg-[#24352A] px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-[#9DD5AB] uppercase">
            {user.role}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          {canManageSettings && (
            <Link
              href="/settings"
              className="rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-[#B8C4B8] hover:bg-[#24352A]"
            >
              Settings
            </Link>
          )}
          <button
            onClick={signOut}
            className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-[#B8C4B8] hover:bg-[#24352A]"
          >
            Sign out
          </button>
        </div>
        <div className="px-2 text-[11px] leading-relaxed text-[#7E9182]">
          <div className="font-mono">GTFS · addis-ababa 2026</div>
          <div>447 routes · 5 operators</div>
        </div>
      </div>
    </aside>
  );
}
