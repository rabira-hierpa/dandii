import { notFound } from "next/navigation";
import { LocaleToggle } from "@/components/foundations/locale-toggle";
import { TransitBackdrop } from "@/components/foundations/transit-backdrop";
import { prisma } from "@/lib/prisma";
import { AcceptInviteCard } from "./accept-invite-card";

export const metadata = {
  title: "You're invited — Dandii",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      invitedBy: { select: { name: true } },
    },
  });
  if (!invitation) notFound();

  return (
    <TransitBackdrop>
      <div className="relative z-1 mx-auto flex w-full max-w-110 flex-col justify-center px-6 py-16 max-sm:px-5 max-sm:py-12">
        <div className="mb-6 flex justify-end">
          <LocaleToggle />
        </div>
        <AcceptInviteCard token={token} invitation={invitation} />
      </div>
    </TransitBackdrop>
  );
}
