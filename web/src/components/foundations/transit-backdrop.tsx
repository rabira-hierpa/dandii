import type { ReactNode } from "react";
import { DandiiMark } from "@/components/foundations/logo/dandii-logo";
import { cx } from "@/utils/cx";

/**
 * Dandii's signature page atmosphere: a soft green wash with drifting route
 * lines and the minibus mark watermarked in the corner. Shared by every
 * full-page surface outside the map (404, access denied, sign in, profile) so
 * they all feel like the same product rather than four unrelated screens.
 */

/** Layered radial + linear gradients — the "soft green morning" wash. */
export const BACKDROP_GRADIENT =
  "bg-[radial-gradient(1200px_600px_at_15%_-10%,#DCFCE7,transparent_60%),radial-gradient(900px_500px_at_90%_110%,#E8F8EE,transparent_55%),linear-gradient(180deg,#F0FDF4_0%,#F8F9FA_55%,#fff_100%)]";

export function RouteLines({ closedRoute }: Readonly<{ closedRoute?: boolean }>) {
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

interface TransitBackdropProps {
  children: ReactNode;
  /** Swap the route motif for the closed-route glyph (access denied). */
  closedRoute?: boolean;
  /** Watermark the minibus mark bottom-right. Off for dense pages. */
  watermark?: boolean;
  className?: string;
}

export function TransitBackdrop({
  children,
  closedRoute = false,
  watermark = true,
  className,
}: Readonly<TransitBackdropProps>) {
  return (
    <main
      className={cx(
        "relative flex min-h-full flex-1 overflow-hidden",
        BACKDROP_GRADIENT,
        className,
      )}
    >
      <RouteLines closedRoute={closedRoute} />
      {children}
      {watermark ? (
        <DandiiMark
          className="status-roll pointer-events-none absolute right-[max(4%,calc(50%-26rem))] bottom-[12%] w-[min(17.5rem,42vw)] text-brand-700 opacity-[0.18] max-sm:hidden"
          title=""
          aria-hidden
        />
      ) : null}
    </main>
  );
}
