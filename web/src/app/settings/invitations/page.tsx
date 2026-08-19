import { SETTINGS_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { InvitationsPanel } from "./invitations-panel";

export default async function InvitationsSettingsPage() {
  const { role } = await requireRole(SETTINGS_ROLES);

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1C2321]">Invitations</h1>
      <p className="mt-1 text-[13px] text-[#5C6B5E]">
        Invite someone to the console by email. They accept by signing in with
        Google using that same address — the role is granted the moment they
        do.
      </p>
      <div className="mt-5">
        <InvitationsPanel currentRole={role} invitations={invitations} />
      </div>
    </div>
  );
}
