import { expect, type Page, test } from "@playwright/test";

/** Visible desktop explore search (content is mirrored in the mobile sheet). */
const desktopSearch = (page: Page) =>
  page.locator('input[placeholder="Search routes and stops"]:visible').first();

test.describe("public map smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("loads with brand and search", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Dandii" }).first()).toBeVisible();
    await expect(desktopSearch(page)).toBeVisible();
  });

  test("searching a route surfaces a result", async ({ page }) => {
    await page.goto("/");
    await desktopSearch(page).fill("AB001");
    await expect(
      page.locator("button:visible", { hasText: "AB001" }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signed-out user sees a sign-in affordance", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /sign in/i }).first(),
    ).toBeVisible();
  });
});

test.describe("library rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("hamburger opens the library icon rail", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open library" }).click();
    await expect(page.getByRole("navigation", { name: "Library" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recent searches" }),
    ).toBeVisible();
  });

  test("opening library as guest shows recent empty state", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("dandii.recentSearches"));
    await page.getByRole("button", { name: "Open library" }).click();
    await expect(
      page.locator("p:visible", {
        hasText: /Searches you run show up here/i,
      }),
    ).toBeVisible();
  });

  test("saved routes requires sign-in when signed out", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open library" }).click();
    await expect(
      page.getByRole("button", { name: "Saved routes" }),
    ).toBeDisabled();
  });
});

test.describe("State B / State C layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("State C: deep-linked route shows detail under search", async ({
    page,
  }) => {
    await page.goto("/?route=17008592");
    await expect(
      page.getByRole("button", { name: "Close route details" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("span:visible", { hasText: "AB001" }).first(),
    ).toBeVisible();
    await expect(page.locator(".left-\\[26rem\\]")).toHaveCount(0);
  });

  test("State B: picking a search result opens route details", async ({
    page,
  }) => {
    await page.goto("/");
    await desktopSearch(page).fill("AB001");
    const result = page.locator("button:visible", { hasText: "AB001" }).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    await expect(
      page.getByRole("button", { name: "Close route details" }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("desktop chrome", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("collapse and expand the left panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Collapse panel" }).click();
    await expect(
      page.getByRole("button", { name: "Expand panel" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Expand panel" }).click();
    await expect(
      page.getByRole("button", { name: "Collapse panel" }),
    ).toBeVisible();
  });

  test("directions tab exposes start/destination comboboxes", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^directions$/i }).click();
    await expect(
      page.getByRole("combobox", { name: "Choose start point" }).first(),
    ).toBeAttached();
    await expect(
      page.getByRole("combobox", { name: "Choose destination" }).first(),
    ).toBeAttached();
  });

  // Regression: react-aria ComboBox cleared a selected endpoint when the other
  // was edited, because the selected stop was filtered out of `items` (an empty
  // collection whose selectedKey couldn't be resolved). directions-panel.tsx.
  test("selecting a start survives typing in the destination", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^directions$/i }).click();

    // The panel renders twice (mobile sheet + desktop). Target the visible one.
    const start = page.locator(
      'input[role="combobox"][aria-label="Choose start point"]:visible',
    );
    const dest = page.locator(
      'input[role="combobox"][aria-label="Choose destination"]:visible',
    );

    await start.click();
    await start.pressSequentially("Megen", { delay: 40 });
    await page.getByRole("option").first().click();
    await expect(start).not.toHaveValue("");
    const startValue = await start.inputValue();

    await dest.click();
    await dest.pressSequentially("Bole", { delay: 40 });

    // The bug wiped the start the moment the destination was typed.
    await expect(start).toHaveValue(startValue);
  });
});
