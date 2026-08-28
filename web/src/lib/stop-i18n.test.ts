import { describe, expect, it } from "vitest";
import { localizedStopName } from "./stop-i18n";

describe("localizedStopName", () => {
  const stop = { name: "Megenagna", nameAm: "መገናኛ" };

  it("returns the Amharic name for locale=am when one exists", () => {
    expect(localizedStopName(stop, "am")).toBe("መገናኛ");
  });

  it("falls back to the English name for locale=am when nameAm is missing", () => {
    expect(localizedStopName({ name: "Bole", nameAm: null }, "am")).toBe("Bole");
  });

  it("falls back when nameAm is undefined", () => {
    expect(localizedStopName({ name: "Piassa" }, "am")).toBe("Piassa");
  });

  it("always returns the English name for locale=en", () => {
    expect(localizedStopName(stop, "en")).toBe("Megenagna");
  });
});
