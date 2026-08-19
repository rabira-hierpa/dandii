import { beforeEach, describe, expect, it } from "vitest";
import { useStopPlacementStore, isInAddis } from "./stop-placement-store";

/**
 * The mode has to be honest about a refused click. Silently ignoring a point
 * outside Addis looks identical to a broken map, and the operator's next move
 * is to click harder rather than to look at the coordinates.
 */

const MEGENAGNA = { lat: 9.02, lon: 38.8 };
const NAIROBI = { lat: -1.29, lon: 36.82 };

beforeEach(() => useStopPlacementStore.getState().reset());

describe("isInAddis", () => {
  it("accepts a point in the city", () => {
    expect(isInAddis(MEGENAGNA)).toBe(true);
  });

  it("rejects a point in another country", () => {
    expect(isInAddis(NAIROBI)).toBe(false);
  });

  it("rejects a transposed lat/lon, the classic typo", () => {
    expect(isInAddis({ lat: 38.8, lon: 9.02 })).toBe(false);
  });
});

describe("stop placement", () => {
  it("records a picked point and leaves placing mode", () => {
    const s = useStopPlacementStore.getState();
    s.startPlacing();
    expect(useStopPlacementStore.getState().placing).toBe(true);

    useStopPlacementStore.getState().pick(MEGENAGNA);
    const after = useStopPlacementStore.getState();
    expect(after.picked).toEqual(MEGENAGNA);
    expect(after.placing).toBe(false);
  });

  it("refuses a point outside Addis and stays in placing mode", () => {
    useStopPlacementStore.getState().startPlacing();
    useStopPlacementStore.getState().pick(NAIROBI);

    const after = useStopPlacementStore.getState();
    expect(after.picked).toBeNull();
    expect(after.outOfBounds).toBe(true);
    // Still placing: the operator meant to place a stop, so the useful next
    // event is another click.
    expect(after.placing).toBe(true);
  });

  it("clears the out-of-bounds warning on the next good click", () => {
    const s = useStopPlacementStore;
    s.getState().startPlacing();
    s.getState().pick(NAIROBI);
    expect(s.getState().outOfBounds).toBe(true);

    s.getState().pick(MEGENAGNA);
    expect(s.getState().outOfBounds).toBe(false);
    expect(s.getState().picked).toEqual(MEGENAGNA);
  });

  it("keeps the picked point after placing ends, so the form can show it", () => {
    useStopPlacementStore.getState().startPlacing();
    useStopPlacementStore.getState().pick(MEGENAGNA);
    expect(useStopPlacementStore.getState().picked).toEqual(MEGENAGNA);
  });

  it("cancelling does not invent a point", () => {
    useStopPlacementStore.getState().startPlacing();
    useStopPlacementStore.getState().cancelPlacing();

    const after = useStopPlacementStore.getState();
    expect(after.placing).toBe(false);
    expect(after.picked).toBeNull();
  });

  it("reset clears everything after the stop is created", () => {
    useStopPlacementStore.getState().startPlacing();
    useStopPlacementStore.getState().pick(MEGENAGNA);
    useStopPlacementStore.getState().reset();

    expect(useStopPlacementStore.getState()).toMatchObject({
      placing: false,
      picked: null,
      outOfBounds: false,
    });
  });
});

describe("coordinate draft", () => {
  it("a picked point fills both fields at click precision", () => {
    useStopPlacementStore.getState().startPlacing();
    useStopPlacementStore.getState().pick({ lat: 9.0104123456, lon: 38.76129 });

    const s = useStopPlacementStore.getState();
    expect(s.latText).toBe("9.010412");
    expect(s.lonText).toBe("38.761290");
  });

  it("stays typeable — a surveyed coordinate overwrites a clicked one", () => {
    useStopPlacementStore.getState().pick({ lat: 9.02, lon: 38.8 });
    useStopPlacementStore.getState().setLatText("9.123456");

    expect(useStopPlacementStore.getState().latText).toBe("9.123456");
  });

  it("a refused click leaves the fields alone", () => {
    useStopPlacementStore.getState().setLatText("9.0");
    useStopPlacementStore.getState().setLonText("38.7");
    useStopPlacementStore.getState().pick({ lat: -1.29, lon: 36.82 });

    const s = useStopPlacementStore.getState();
    expect(s.latText).toBe("9.0");
    expect(s.lonText).toBe("38.7");
  });

  it("reset empties the fields after the stop is created", () => {
    useStopPlacementStore.getState().pick({ lat: 9.02, lon: 38.8 });
    useStopPlacementStore.getState().reset();

    expect(useStopPlacementStore.getState().latText).toBe("");
  });
});
