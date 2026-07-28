import { describe, expect, it } from "vitest";
import { groupStopsByName, type NamedStop } from "./stop-search";

const stop = (id: string, name: string): NamedStop => ({
  id,
  name,
  lat: 9,
  lon: 38,
});

describe("groupStopsByName", () => {
  it("collapses same-named stops and counts them", () => {
    const rows = [
      stop("n1", "Megenagna"),
      stop("n2", "Megenagna"),
      stop("n3", "Megenagna"),
    ];
    const out = groupStopsByName(rows, 8);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Megenagna");
    expect(out[0].count).toBe(3);
  });

  it("keeps the first stop of each group as the representative", () => {
    const out = groupStopsByName(
      [stop("first", "Bole"), stop("second", "Bole")],
      8,
    );
    expect(out[0].id).toBe("first");
  });

  it("groups case-insensitively", () => {
    const out = groupStopsByName(
      [stop("a", "Megenagna"), stop("b", "megenagna")],
      8,
    );
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
  });

  it("keeps distinct names separate and reports count 1 for singletons", () => {
    const out = groupStopsByName(
      [stop("a", "Megenagna"), stop("b", "Megenagna Terminal")],
      8,
    );
    expect(out.map((s) => s.name)).toEqual(["Megenagna", "Megenagna Terminal"]);
    expect(out.every((s) => s.count === 1)).toBe(true);
  });

  it("returns at most `limit` groups", () => {
    const rows = ["A", "B", "C", "D", "E"].map((n) => stop(n, n));
    expect(groupStopsByName(rows, 3)).toHaveLength(3);
  });

  it("handles empty input", () => {
    expect(groupStopsByName([], 8)).toEqual([]);
  });
});
