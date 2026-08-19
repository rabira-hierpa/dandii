import { beforeEach, describe, expect, it } from "vitest";
import { allowSnap, resetSnapRateLimit } from "./snap-rate-limit";

const LIMIT = 120;
const WINDOW_MS = 60_000;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetSnapRateLimit();
});

describe("allowSnap", () => {
  it("allows an ordinary drawing session", () => {
    // Eight waypoints placed in a few seconds is normal use, not abuse.
    for (let i = 0; i < 8; i++) {
      expect(allowSnap("operator-1", NOW + i * 400).allowed).toBe(true);
    }
  });

  it("allows exactly the limit inside one window", () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(allowSnap("operator-1", NOW + i).allowed).toBe(true);
    }
  });

  it("refuses the request past the limit", () => {
    for (let i = 0; i < LIMIT; i++) allowSnap("operator-1", NOW + i);

    const result = allowSnap("operator-1", NOW + LIMIT);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports a truthful Retry-After", () => {
    allowSnap("operator-1", NOW);
    for (let i = 1; i < LIMIT; i++) allowSnap("operator-1", NOW + i);

    // The oldest hit is at NOW, so the budget frees up a minute after it.
    const halfway = NOW + WINDOW_MS / 2;
    const result = allowSnap("operator-1", halfway);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(31);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(29);
  });

  it("frees the budget once the window rolls past", () => {
    for (let i = 0; i < LIMIT; i++) allowSnap("operator-1", NOW + i);
    expect(allowSnap("operator-1", NOW + LIMIT).allowed).toBe(false);

    expect(allowSnap("operator-1", NOW + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("throttles per operator, not globally", () => {
    for (let i = 0; i < LIMIT; i++) allowSnap("operator-1", NOW + i);

    // One operator drawing hard must not stop a colleague from working.
    expect(allowSnap("operator-2", NOW + LIMIT).allowed).toBe(true);
  });

  it("does not spend budget on a refused request", () => {
    for (let i = 0; i < LIMIT; i++) allowSnap("operator-1", NOW + i);
    for (let i = 0; i < 50; i++) allowSnap("operator-1", NOW + LIMIT + i);

    // The refusals must not push the window forward, or a blocked operator
    // would keep extending their own timeout by retrying.
    expect(allowSnap("operator-1", NOW + WINDOW_MS + 1).allowed).toBe(true);
  });
});
