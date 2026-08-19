"use client";

import { useState, useTransition } from "react";
import { createInvitation, revokeInvitation } from "@/actions/invitations";
import { ASSIGNABLE_ROLES, type AppRole } from "@/lib/permissions";
import { cx } from "@/utils/cx";

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date | string;
  createdAt: Date | string;
  invitedBy: { name: string };
}

const STATUS_BADGES: Record<InvitationRow["status"], string> = {
  PENDING: "bg-[#FEF3C7] text-[#92400E]",
  ACCEPTED: "bg-[#DCFCE7] text-[#166534]",
  REVOKED: "bg-[#FEE2E2] text-[#991B1B]",
  EXPIRED: "bg-[#EEF1EA] text-[#5C6B5E]",
};

const inputClass =
  "rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] text-[#1C2321] placeholder:text-[#9AA69C]";

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InvitationsPanel({
  currentRole,
  invitations,
}: {
  currentRole: AppRole;
  invitations: InvitationRow[];
}) {
  const assignable = ASSIGNABLE_ROLES[currentRole] ?? [];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole | "">(assignable[0] ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ link: string; emailed: boolean } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const submitInvite = () => {
    if (!role || email.trim() === "") return;
    setError(null);
    setLastLink(null);
    startTransition(async () => {
      const result = await createInvitation({ email: email.trim(), role });
      if (result.ok) {
        setEmail("");
        setLastLink({ link: result.data.link, emailed: result.data.emailed });
      } else {
        setError(result.error);
      }
    });
  };

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const revoke = (id: string) => {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const result = await revokeInvitation({ invitationId: id });
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {assignable.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-[#E2E6DE] bg-white p-4">
          <div className="text-[12.5px] font-semibold text-[#1C2321]">
            Invite someone new
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={cx(inputClass, "w-64")}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AppRole)}
                className={cx(inputClass, "cursor-pointer")}
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={submitInvite}
              disabled={isPending || email.trim() === "" || !role}
              className="cursor-pointer rounded-lg bg-[#1C2321] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#2C3531] disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send invite"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#991B1B]">
              {error}
            </div>
          )}

          {lastLink && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5 text-[12.5px] text-[#166534]">
              <span>
                {lastLink.emailed
                  ? "Invitation sent."
                  : "No email provider is configured — share this link directly:"}
              </span>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-[11.5px] text-[#1C2321]">
                  {lastLink.link}
                </code>
                <button
                  type="button"
                  onClick={() => copyLink(lastLink.link)}
                  className="shrink-0 cursor-pointer rounded-lg border border-[#86EFAC] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#15803D] hover:bg-[#F0FDF4]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E2E6DE] bg-white">
        <div className="grid min-w-150 grid-cols-[1.6fr_120px_100px_120px_110px_90px] items-center gap-3 border-b border-[#E2E6DE] bg-[#F8FAF6] px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span>Invited by</span>
          <span>Expires</span>
          <span>Action</span>
        </div>
        {invitations.map((inv) => {
          const manageable =
            inv.status === "PENDING" && assignable.includes(inv.role as AppRole);
          return (
            <div
              key={inv.id}
              className="grid min-w-150 grid-cols-[1.6fr_120px_100px_120px_110px_90px] items-center gap-3 border-b border-[#EEF1EA] px-5 py-3 last:border-b-0"
            >
              <span className="truncate text-[13px] text-[#1C2321]">
                {inv.email}
              </span>
              <span className="text-[12.5px] text-[#3D4A3F]">{inv.role}</span>
              <span
                className={cx(
                  "w-fit justify-self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  STATUS_BADGES[inv.status],
                )}
              >
                {inv.status.toLowerCase()}
              </span>
              <span className="truncate text-[12px] text-[#5C6B5E]">
                {inv.invitedBy.name}
              </span>
              <span className="text-[12px] text-[#5C6B5E]">
                {formatDate(inv.expiresAt)}
              </span>
              {manageable ? (
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  disabled={busyId === inv.id}
                  className="cursor-pointer justify-self-start rounded-lg border border-[#FCA5A5] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  Revoke
                </button>
              ) : (
                <span className="text-[12px] text-[#9AA69C]">—</span>
              )}
            </div>
          );
        })}
        {invitations.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[#5C6B5E]">
            No invitations yet.
          </div>
        )}
      </div>
    </div>
  );
}
