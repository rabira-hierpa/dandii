import { describe, expect, it } from "vitest";
// messages/ lives outside the @/ (src) alias root — next-intl loads catalogs
// from the project root, so this cross-root test import has no alias to use.
/* eslint-disable no-restricted-imports */
import am from "../../messages/am.json";
import en from "../../messages/en.json";
/* eslint-enable no-restricted-imports */
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, isLocale } from "./config";

type Tree = { [key: string]: string | Tree };

/** Flatten a message tree to dotted key paths. */
function keyPaths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : keyPaths(value, path);
  });
}

/** ICU placeholders like {count} — a translation must keep every one. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const enFlat = flatten(en as Tree);
const amFlat = flatten(am as Tree);

describe("message catalogs", () => {
  it("define exactly the same keys (no missing or orphaned translations)", () => {
    expect(keyPaths(am as Tree).sort()).toEqual(keyPaths(en as Tree).sort());
  });

  it("has no empty strings", () => {
    for (const [key, value] of Object.entries(amFlat)) {
      expect(value.trim(), `am.${key} is empty`).not.toBe("");
    }
  });

  it("keeps every ICU placeholder in the Amharic translation", () => {
    // A dropped {count} silently renders the wrong sentence at runtime.
    for (const [key, value] of Object.entries(enFlat)) {
      expect(placeholders(amFlat[key]), `placeholders differ for ${key}`).toEqual(
        placeholders(value),
      );
    }
  });

  it("actually translates — Amharic strings are not copied English", () => {
    // Ge'ez script check on a few user-visible strings.
    const geez = /[ሀ-፿]/;
    for (const key of ["auth.title", "leaderboard.title", "common.backToMap"]) {
      expect(amFlat[key], `${key} looks untranslated`).toMatch(geez);
    }
  });
});

describe("locale config", () => {
  it("recognizes supported locales and rejects others", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("am")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("labels every locale", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(LOCALE_SHORT[locale]).toBeTruthy();
    }
  });
});
