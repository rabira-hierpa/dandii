import { describe, expect, it } from "vitest";
import {
  closedWindow,
  describeClosure,
  isPairBlocked,
  isPairClosed,
  type ClosureRange,
} from "./closures";

/**
 * The screenshot case: Tx YK 016 runs
 *   0 Megenagna → 1 Lem Hotel → 2 22 Mazoria → 3 Stadium → 4 Legehar → 5 Mexico
 * The road is blocked past 22 Mazoria, so the closed range is Stadium…Mexico.
 */
const STOPS = [
  { id: "megenagna", name: "Megenagna" },
  { id: "lem", name: "Lem Hotel" },
  { id: "mazoria22", name: "22 Mazoria" },
  { id: "stadium", name: "Stadium" },
  { id: "legehar", name: "Legehar" },
  { id: "mexico", name: "Mexico" },
];
const SEQ = new Map(STOPS.map((s, i) => [s.id, i]));
/** The same trip running the other way — sequences reversed. */
const SEQ_REVERSE = new Map(STOPS.map((s, i) => [s.id, STOPS.length - 1 - i]));

const severedTail: ClosureRange = {
  kind: "SEVERED",
  fromStopId: "stadium",
  toStopId: "mexico",
};
const skippedMiddle: ClosureRange = {
  kind: "SKIPPED",
  fromStopId: "stadium",
  toStopId: "legehar",
};
const severedMiddle: ClosureRange = {
  kind: "SEVERED",
  fromStopId: "stadium",
  toStopId: "legehar",
};
const wholeRoute: ClosureRange = {
  kind: "WHOLE_ROUTE",
  fromStopId: null,
  toStopId: null,
};

describe("closedWindow", () => {
  it("resolves stop ids to an inclusive sequence range", () => {
    expect(closedWindow(severedTail, SEQ)).toEqual({ start: 3, end: 5 });
  });

  it("normalizes order, so the reverse-direction trip gets the same stretch", () => {
    // Reversed trip: Mexico=0 … Stadium=2, so from/to arrive swapped.
    expect(closedWindow(severedTail, SEQ_REVERSE)).toEqual({ start: 0, end: 2 });
  });

  it("returns null for a whole-route closure", () => {
    expect(closedWindow(wholeRoute, SEQ)).toBeNull();
  });

  it("returns null when the trip doesn't serve both boundary stops", () => {
    const partial = new Map([["megenagna", 0], ["lem", 1]]);
    expect(closedWindow(severedTail, partial)).toBeNull();
  });
});

describe("isPairBlocked — the screenshot case (SEVERED tail)", () => {
  const w = closedWindow(severedTail, SEQ);

  it("still allows the working leg: Megenagna → 22 Mazoria", () => {
    expect(isPairBlocked(severedTail, w, 0, 2)).toBe(false);
  });

  it("blocks Megenagna → Mexico (destination is in the closed stretch)", () => {
    expect(isPairBlocked(severedTail, w, 0, 5)).toBe(true);
  });

  it("blocks boarding inside the closed stretch", () => {
    expect(isPairBlocked(severedTail, w, 3, 5)).toBe(true);
  });

  it("allows a pair entirely before the closure", () => {
    expect(isPairBlocked(severedTail, w, 0, 1)).toBe(false);
  });
});

describe("SEVERED vs SKIPPED — the through-travel distinction", () => {
  const wSkip = closedWindow(skippedMiddle, SEQ);
  const wSever = closedWindow(severedMiddle, SEQ);

  it("SKIPPED allows travel across the closed stops", () => {
    // Megenagna → Mexico: the bus detours, so the trip still works.
    expect(isPairBlocked(skippedMiddle, wSkip, 0, 5)).toBe(false);
  });

  it("SEVERED blocks travel across the same stops", () => {
    // Road is blocked, so nothing gets from one side to the other.
    expect(isPairBlocked(severedMiddle, wSever, 0, 5)).toBe(true);
  });

  it("both block boarding or alighting at a closed stop", () => {
    expect(isPairBlocked(skippedMiddle, wSkip, 0, 3)).toBe(true);
    expect(isPairBlocked(severedMiddle, wSever, 0, 3)).toBe(true);
  });

  it("SEVERED still allows a pair wholly on one side of the break", () => {
    // Megenagna → 22 Mazoria, entirely before the closed Stadium…Legehar run.
    expect(isPairBlocked(severedMiddle, wSever, 0, 2)).toBe(false);
  });

  it("blocks boarding at a closed stop even when heading away from the break", () => {
    // Legehar itself is closed, so Legehar → Mexico is not rideable either.
    expect(isPairBlocked(severedMiddle, wSever, 4, 5)).toBe(true);
  });
});

describe("WHOLE_ROUTE", () => {
  it("blocks every pair", () => {
    expect(isPairBlocked(wholeRoute, null, 0, 1)).toBe(true);
    expect(isPairBlocked(wholeRoute, null, 4, 5)).toBe(true);
  });
});

describe("isPairClosed", () => {
  it("is false when no closure applies", () => {
    expect(isPairClosed([], SEQ, 0, 5)).toBe(false);
  });

  it("blocks if ANY active closure blocks the pair", () => {
    expect(isPairClosed([skippedMiddle, severedTail], SEQ, 0, 5)).toBe(true);
  });

  it("allows a pair no closure touches", () => {
    expect(isPairClosed([severedTail], SEQ, 0, 1)).toBe(false);
  });
});

describe("describeClosure", () => {
  it("names the still-usable leg for a severed tail", () => {
    const s = describeClosure(severedTail, STOPS);
    expect(s).toContain("Megenagna");
    expect(s).toContain("22 Mazoria");
    expect(s).toContain("Stadium, Legehar and Mexico");
  });

  it("says the route still runs when stops are skipped", () => {
    expect(describeClosure(skippedMiddle, STOPS)).toContain("skip");
  });

  it("describes a whole-route closure plainly", () => {
    expect(describeClosure(wholeRoute, STOPS)).toContain("whole route");
  });
});
