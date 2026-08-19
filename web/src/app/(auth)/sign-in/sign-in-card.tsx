"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/base/buttons/button";
import { GoogleIcon } from "@/components/foundations/google-icon";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { authClient } from "@/lib/auth-client";

export function SignInCard() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const callbackURL = searchParams.get("callbackURL") ?? "/console";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
    });
    if (error) {
      setError(error.message ?? "Sign-in failed. Please try again.");
      setPending(false);
    }
  };

  return (
    <div className="status-rise flex w-full flex-col gap-6">
      <Link href="/" className="status-rise-delay-1 w-fit text-brand-700">
        <DandiiLogo />
      </Link>

      <span className="status-rise-delay-2 inline-flex w-fit items-center gap-2 rounded-full bg-brand-700/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-brand-700">
        <span className="status-pulse relative size-1.5 rounded-full bg-brand-700" />
        {t("welcomeBack")}
      </span>

      <div className="status-rise-delay-3 flex flex-col gap-2">
        <h1 className="font-display text-display-sm font-bold tracking-tight text-primary max-sm:text-display-xs">
          {t("title")}
        </h1>
        <p className="max-w-prose text-md leading-relaxed text-tertiary">
          {t("subtitle")}
        </p>
      </div>

      <div className="status-rise-delay-4 flex flex-col gap-4 rounded-2xl bg-white/80 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur-sm">
        <Button
          color="secondary"
          size="lg"
          className="w-full"
          onClick={signInWithGoogle}
          isDisabled={pending}
          iconLeading={GoogleIcon}
        >
          {pending ? t("redirecting") : t("continueWithGoogle")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-error-primary">
            {error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-quaternary">
          {t("consoleNote")}
        </p>
      </div>

      <p className="status-rise-delay-5 text-sm text-quaternary">
        {t("justExploring")}{" "}
        <Link
          href="/"
          className="font-semibold text-brand-700 hover:text-brand-800"
        >
          {t("browseMap")}
        </Link>
      </p>
    </div>
  );
}
