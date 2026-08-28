"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/actions/invitations";
import { Button } from "@/components/base/buttons/button";
import { GoogleIcon } from "@/components/foundations/google-icon";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { authClient, useSession } from "@/lib/auth-client";

interface InvitationPreview {
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  invitedBy: { name: string };
}

const STATIC_MESSAGE: Partial<Record<InvitationPreview["status"], string>> = {
  ACCEPTED: "This invitation has already been used.",
  REVOKED: "This invitation was revoked.",
  EXPIRED: "This invitation has expired — ask for a new one.",
};

export function AcceptInviteCard({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationPreview;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInPending, setSignInPending] = useState(false);
  // Guards re-entry without a synchronous setState in the effect body —
  // accepting is a request in flight, not UI state to render from.
  const acceptStartedRef = useRef(false);

  const isExpired =
    invitation.status === "EXPIRED" || new Date(invitation.expiresAt) < new Date();
  const usable = invitation.status === "PENDING" && !isExpired;
  const staticMessage = isExpired
    ? STATIC_MESSAGE.EXPIRED
    : STATIC_MESSAGE[invitation.status];
  const accepting = usable && Boolean(session?.user) && !accepted && !error;

  // Auto-accept the moment a matching session exists — covers both "just
  // signed in via the button below" and "was already signed in when they
  // opened this link".
  useEffect(() => {
    if (!usable || !session?.user || acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    void (async () => {
      const result = await acceptInvitation({ token });
      if (result.ok) {
        setAccepted(true);
        setTimeout(() => router.push("/console"), 1200);
      } else if (result.error === "SIGN_IN_REQUIRED") {
        acceptStartedRef.current = false;
      } else {
        setError(result.error);
      }
    })();
  }, [session?.user, usable, token, router]);

  const signInWithGoogle = async () => {
    setSignInPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `/invite/${token}`,
    });
    if (error) {
      setError(error.message ?? "Sign-in failed. Please try again.");
      setSignInPending(false);
    }
  };

  const body = () => {
    if (staticMessage) {
      return <p className="text-md leading-relaxed text-tertiary">{staticMessage}</p>;
    }
    if (accepted) {
      return (
        <p className="text-md leading-relaxed text-tertiary">
          You&apos;re now a <strong>{invitation.role}</strong>. Taking you to the
          console…
        </p>
      );
    }
    if (accepting) {
      return (
        <p className="text-md leading-relaxed text-tertiary">
          Accepting your invitation…
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-white/80 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur-sm">
        <Button
          color="secondary"
          size="lg"
          className="w-full"
          onClick={signInWithGoogle}
          isDisabled={signInPending}
          iconLeading={GoogleIcon}
        >
          {signInPending ? "Redirecting…" : "Continue with Google"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-error-primary">
            {error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-quaternary">
          Sign in with <strong>{invitation.email}</strong> — the role is only
          granted to that address.
        </p>
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <Link href="/" className="w-fit text-brand-700">
        <DandiiLogo />
      </Link>

      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-700/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-brand-700">
        <span className="relative size-1.5 rounded-full bg-brand-700" />
        You&apos;re invited
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-sm font-bold tracking-tight text-primary max-sm:text-display-xs">
          Join the Dandii console
        </h1>
        <p className="max-w-prose text-md leading-relaxed text-tertiary">
          {invitation.invitedBy.name} invited{" "}
          <strong>{invitation.email}</strong> to join as{" "}
          <strong>{invitation.role}</strong>.
        </p>
      </div>

      {body()}
    </div>
  );
}
