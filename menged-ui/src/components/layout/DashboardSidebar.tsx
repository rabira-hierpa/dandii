"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  LucideIcon,
  Map,
  TrafficCone,
  Settings,
} from "lucide-react";

interface SidebarItemProps {
  href: string;
  icon: LucideIcon;
  title: string;
}

function SidebarItem({ href, icon: Icon, title }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
        isActive ? "bg-muted font-medium text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </Link>
  );
}

export function DashboardSidebar() {
  return (
    <div className="flex h-screen w-64 flex-col border-r bg-background px-2 py-4">
      <div className="px-3 py-2">
        <h2 className="text-lg font-bold">Dashboard</h2>
        <p className="text-xs text-muted-foreground">
          Manage transport information
        </p>
      </div>
      <div className="flex-1 py-8">
        <nav className="grid gap-1 px-2">
          <SidebarItem href="/dashboard" icon={BarChart3} title="Analytics" />
          <SidebarItem
            href="/dashboard/road-closures"
            icon={TrafficCone}
            title="Road Closures"
          />
          <SidebarItem
            href="/dashboard/holidays"
            icon={Calendar}
            title="Public Holidays"
          />
        </nav>
      </div>
      <div className="border-t pt-4">
        <nav className="grid gap-1 px-2">
          <SidebarItem href="/map" icon={Map} title="Route Planner" />
          <SidebarItem href="/profile" icon={Settings} title="Settings" />
        </nav>
      </div>
    </div>
  );
}
