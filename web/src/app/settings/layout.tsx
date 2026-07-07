import Link from "next/link";
import { SETTINGS_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireRole(SETTINGS_ROLES);

  return (
    <div className="min-h-screen bg-[#F4F5F2]">
      <header className="border-b border-[#E2E6DE] bg-white">
        <div className="mx-auto flex max-w-260 items-center gap-4 px-6 py-4">
          <Link href="/console" className="group">
            <div className="font-mono text-[11px] font-semibold tracking-widest text-[#15803D]">
              MENGED
            </div>
            <div className="text-[15px] leading-tight font-bold text-[#1C2321] group-hover:text-[#15803D]">
              Settings
            </div>
          </Link>
          <div className="ml-auto text-right">
            <div className="text-[13px] font-semibold text-[#1C2321]">
              {session.user.name}
            </div>
            <div className="text-[11.5px] text-[#5C6B5E]">
              {session.user.email}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-260 gap-10 px-6 py-8 max-md:flex-col max-md:gap-4">
        <SettingsNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
