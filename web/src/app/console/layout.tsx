import { ConsoleMobileNav } from "@/components/console/mobile-nav";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { CONSOLE_ROLES, SETTINGS_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, role } = await requireRole(CONSOLE_ROLES);
  const user = {
    name: session.user.name,
    email: session.user.email,
    role,
  };
  const canManageSettings = SETTINGS_ROLES.includes(role);
  const pendingProposals = await prisma.fareProposal.count({
    where: { status: "PENDING" },
  });

  return (
    <div className="flex min-h-screen bg-[#F4F5F2]">
      <ConsoleSidebar
        user={user}
        canManageSettings={canManageSettings}
        pendingProposals={pendingProposals}
      />
      <ConsoleMobileNav
        user={user}
        canManageSettings={canManageSettings}
        pendingProposals={pendingProposals}
      />
      <main className="min-w-0 flex-1 px-9 pt-7 pb-12 max-sm:px-4 max-sm:pt-20 max-sm:pb-26">
        {children}
      </main>
    </div>
  );
}
