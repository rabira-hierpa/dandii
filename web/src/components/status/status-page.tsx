import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { DandiiLogo, DandiiMark } from "@/components/foundations/logo/dandii-logo";
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

function RouteLines({ closedRoute }: Readonly<{ closedRoute?: boolean }>) {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-55" aria-hidden>
      <svg
        className="size-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {closedRoute ? (
          <>
            <path
              d="M-40 260 C 200 300, 380 160, 600 220 S 920 400, 1140 320 S 1400 180, 1520 240"
              stroke="#86EFAC"
              strokeWidth="2"
              strokeDasharray="6 10"
            />
            <path
              d="M-20 560 C 220 500, 400 620, 620 580 S 960 460, 1180 520 S 1400 640, 1500 600"
              stroke="#BBF7D0"
              strokeWidth="2.5"
            />
            <g transform="translate(620 560)" opacity="0.7">
              <circle r="18" fill="#F0FDF4" stroke="#15803D" strokeWidth="2" />
              <path
                d="M-8 0h16M0 -8v16"
                stroke="#15803D"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform="rotate(45)"
              />
            </g>
          </>
        ) : (
          <>
            <path
              d="M-40 220 C 220 180, 360 320, 560 280 S 900 120, 1100 200 S 1400 360, 1520 300"
              stroke="#86EFAC"
              strokeWidth="2"
              strokeDasharray="6 10"
            />
            <path
              d="M-20 480 C 180 520, 340 400, 540 440 S 880 620, 1120 560 S 1380 480, 1500 520"
              stroke="#BBF7D0"
              strokeWidth="2.5"
            />
            <path
              d="M 80 760 C 280 700, 420 780, 640 720 S 980 640, 1200 700 S 1400 780, 1520 740"
              stroke="#86EFAC"
              strokeWidth="1.5"
              strokeDasharray="4 8"
            />
            <circle cx="560" cy="280" r="5" fill="#15803D" opacity="0.35" />
            <circle cx="1120" cy="560" r="5" fill="#15803D" opacity="0.35" />
            <circle cx="640" cy="720" r="4" fill="#15803D" opacity="0.25" />
          </>
        )}
      </svg>
    </div>
  );
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
    <main
      className={cx(
        "relative flex min-h-full flex-1 overflow-hidden",
        "bg-[radial-gradient(1200px_600px_at_15%_-10%,#DCFCE7,transparent_60%),radial-gradient(900px_500px_at_90%_110%,#E8F8EE,transparent_55%),linear-gradient(180deg,#F0FDF4_0%,#F8F9FA_55%,#fff_100%)]",
      )}
    >
      <RouteLines closedRoute={closedRoute} />

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

      <DandiiMark
        className="status-roll pointer-events-none absolute right-[max(4%,calc(50%-26rem))] bottom-[12%] w-[min(17.5rem,42vw)] text-brand-700 opacity-[0.18] max-sm:hidden"
        title=""
        aria-hidden
      />
    </main>
  );
}
