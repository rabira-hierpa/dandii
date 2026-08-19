-- Amharic stop names: additive, nullable columns. Null falls back to the
-- English `name` everywhere it's read.
ALTER TABLE "stop" ADD COLUMN "nameAm" TEXT;
ALTER TABLE "stop_override" ADD COLUMN "nameAm" TEXT;

-- Console invitations.
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "acceptedUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");
CREATE INDEX "invitation_email_idx" ON "invitation"("email");
CREATE INDEX "invitation_status_idx" ON "invitation"("status");

ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
