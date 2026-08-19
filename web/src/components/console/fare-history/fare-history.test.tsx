// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { FareHistoryEntry } from "@/types/fares";
import { FareHistory } from "./fare-history";

/**
 * The distinction this component exists to keep is "nothing changed" versus
 * "we could not find out" — a failed fetch rendering an empty list would tell
 * an operator their fare has a clean record when in fact nobody looked.
 */

function entry(over: Partial<FareHistoryEntry> = {}): FareHistoryEntry {
  return {
    id: "log-1",
    source: "CONSOLE_EDIT",
    changedByName: "Sara",
    proposalId: null,
    createdAt: "2026-08-01T09:00:00.000Z",
    before: { kind: "FLAT", flatEtb: "8.00", tierCount: 0 },
    after: { kind: "FLAT", flatEtb: "12.00", tierCount: 0 },
    ...over,
  };
}

function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
    const body = await impl();
    return { ok: true, json: async () => body } as Response;
  }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FareHistory", () => {
  it("renders a change as before → after", async () => {
    mockFetch(async () => [entry()]);
    render(<FareHistory routeId="r1" />);

    await waitFor(() =>
      expect(screen.getByText(/8\.00 ETB → 12\.00 ETB/)).toBeTruthy(),
    );
    expect(screen.getByText(/edited in the console by Sara/)).toBeTruthy();
  });

  it("says a fare has not changed when the log is empty", async () => {
    mockFetch(async () => []);
    render(<FareHistory routeId="r1" />);

    await waitFor(() =>
      expect(screen.getByText(/has not changed/)).toBeTruthy(),
    );
  });

  it("reports a failed load instead of showing an empty history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false } as Response),
    );
    render(<FareHistory routeId="r1" />);

    await waitFor(() =>
      expect(screen.getByText(/Could not load/)).toBeTruthy(),
    );
    expect(screen.queryByText(/has not changed/)).toBeNull();
  });

  it("describes a route that had no fare before", async () => {
    mockFetch(async () => [
      entry({ before: { kind: null, flatEtb: null, tierCount: 0 } }),
    ]);
    render(<FareHistory routeId="r1" />);

    await waitFor(() =>
      expect(screen.getByText(/no fare → 12\.00 ETB/)).toBeTruthy(),
    );
  });

  it("counts bands for a tiered fare rather than showing an amount", async () => {
    mockFetch(async () => [
      entry({
        after: { kind: "TIERED", flatEtb: null, tierCount: 3 },
      }),
    ]);
    render(<FareHistory routeId="r1" />);

    await waitFor(() => expect(screen.getByText(/3 tiers/)).toBeTruthy());
  });

  it("names a proposal approval as such", async () => {
    mockFetch(async () => [
      entry({ source: "PROPOSAL_APPROVAL", proposalId: "p1" }),
    ]);
    render(<FareHistory routeId="r1" />);

    await waitFor(() =>
      expect(screen.getByText(/from a rider proposal/)).toBeTruthy(),
    );
  });
});
