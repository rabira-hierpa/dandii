"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setLeaderboardOptIn } from "@/actions/saved-routes";

/**
 * Join / leave the public contributor leaderboard. Opt-in only: listing a real
 * name publicly is a deliberate choice, never a side effect of contributing.
 */
export function LeaderboardToggle({
  initialOptIn,
}: Readonly<{ initialOptIn: boolean }>) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !optIn;
    setOptIn(next); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setLeaderboardOptIn({ optIn: next });
      if (!res.ok) {
        setOptIn(!next); // roll back
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          aria-label="Show me on the public leaderboard"
          onClick={toggle}
          disabled={isPending}
          className="mt-0.5 shrink-0 cursor-pointer disabled:opacity-50"
        >
          <span
            className="relative block h-5.5 w-9.5 rounded-full transition-colors duration-200"
            style={{ background: optIn ? "#15803D" : "#DADCE0" }}
          >
            <span
              className="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition-transform duration-200"
              style={{ transform: optIn ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
        </button>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-[#202124]">
            Show me on the{" "}
            <Link
              href="/leaderboard"
              className="font-semibold text-brand-700 hover:underline"
            >
              public leaderboard
            </Link>
          </div>
          <p className="text-[12px] text-[#5F6368]">
            {optIn
              ? "Your name, level, and points are visible to everyone."
              : "Off — you contribute privately. Only you see your points."}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-[#D93025]">
          {error}
        </p>
      )}
    </div>
  );
}
