import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { TransitBackdrop } from "@/components/foundations/transit-backdrop";
import { cx } from "@/utils/cx";

export interface StatusAction {
  href: string;
  label: string;
  color?: "primary" | "secondary";
}

interface StatusPageProps {
  /** Large display code — e.g. "404" or "403" */
  code: string;
  /** Compact mono chip under the code */
  eyebrow: string;
  title: string;
  description: string;
  actions: StatusAction[];
  footnote?: ReactNode;
  /** Smaller code treatment for longer labels like access-denied */
  compactCode?: boolean;
  /** Show the closed-route glyph on the background (access denied) */
  closedRoute?: boolean;
}

/**
 * Shared shell for public status surfaces (404, access denied).
 * Soft green atmosphere + route-line motif — stays inside Dandii’s map world.
 */
export function StatusPage({
  code,
  eyebrow,
  title,
  description,
  actions,
  footnote,
  compactCode = false,
  closedRoute = false,
}: Readonly<StatusPageProps>) {
  return (
    <TransitBackdrop closedRoute={closedRoute}>

      <div className="status-rise relative z-1 mx-auto flex w-full max-w-140 flex-col items-start gap-5 px-6 pt-18 pb-20 max-sm:px-5 max-sm:pt-12 max-sm:pb-16">
        <Link href="/" className="status-rise-delay-1 text-brand-700">
          <DandiiLogo />
        </Link>

        <p
          className={cx(
            "status-rise-delay-2 font-display font-extrabold tracking-tighter text-brand-700",
            compactCode
              ? "mt-8 text-5xl max-sm:text-4xl"
              : "mt-6 text-[clamp(5.5rem,18vw,8.75rem)] leading-[0.9]",
          )}
        >
          {code}
        </p>

        <span className="status-rise-delay-3 inline-flex items-center gap-2 rounded-full bg-brand-700/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-brand-700">
          <span className="status-pulse relative size-1.5 rounded-full bg-brand-700" />
          {eyebrow}
        </span>

        <h1 className="status-rise-delay-4 font-display text-display-sm font-bold tracking-tight text-primary max-sm:text-display-xs">
          {title}
        </h1>

        <p className="status-rise-delay-5 max-w-prose text-md leading-relaxed text-tertiary">
          {description}
        </p>

        <div className="status-rise-delay-6 mt-2 flex flex-wrap gap-2.5">
          {actions.map((action) => (
            <Button
              key={action.href + action.label}
              href={action.href}
              color={action.color ?? "primary"}
              size="md"
            >
              {action.label}
            </Button>
          ))}
        </div>

        {footnote ? (
          <p className="status-rise-delay-7 mt-4 text-sm text-quaternary">{footnote}</p>
        ) : null}
      </div>

    </TransitBackdrop>
  );
}
