"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/base/buttons/button";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { authClient } from "@/lib/auth-client";

const GoogleIcon = () => (
  <svg data-icon viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
    />
  </svg>
);

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
