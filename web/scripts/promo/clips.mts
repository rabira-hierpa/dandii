/**
 * The shot list.
 *
 * Every clip is one idea, 5-11 seconds, recorded into its own file so an AI
 * editor can reorder and recombine them freely. Clips are deliberately
 * overlapping in coverage (three different ways into the map, two into the
 * rewards loop) so there is always an alternate take for a given beat.
 *
 * Anything a clip needs *before* its featured action — typing a query so a
 * result list exists, expanding a sheet — happens fast and is then cut off by
 * `mark()`, which records the timestamp the encoder trims to. That is what
 * keeps a 25-second setup-and-payoff run down to an 8-second clip.
 */
import type { Studio } from "./studio.mts";

export interface Clip {
  name: string;
  /** One-line description, written to the index the user reads. */
  title: string;
  /** Needs the demo session cookie. */
  signedIn?: boolean;
  run(s: Studio): Promise<void>;
}

/** Verified to have real shape geometry, a flat fare, and a headway. */
const HERO_ROUTE = { code: "AB126", query: "Bole Arabsa" };

const SHEET_HANDLE = 'button[aria-label="Expand panel"]:visible, button[aria-label="Collapse panel"]:visible';

/**
 * The map's top search field, matched by accessible name rather than by its
 * exact placeholder — that copy has already changed once mid-project, and a
 * reworded placeholder should not silently break every search clip.
 */
const searchBox = (s: Studio) =>
  s.page.getByRole("textbox", { name: /search/i }).locator("visible=true").first();

/**
 * The Explore/Directions tab and the blue submit button both render the word
 * "Directions", so text alone is ambiguous. They are distinguished by DOM
 * order: the tab sits in the sheet header, the submit button below the two
 * endpoint fields. At 360px only the mobile copy of the panel is visible, so
 * exactly two match and last/first is unambiguous.
 */
const directionsTab = (s: Studio) =>
  s.page.locator("button:visible").filter({ hasText: /^Directions$/ }).first();
const planButton = (s: Studio) =>
  s.page.locator("button:visible").filter({ hasText: /^Directions$/ }).last();

/** Drag the bottom sheet down to its collapsed snap, giving the map the frame. */
async function collapseSheet(s: Studio) {
  const handle = await s.at(SHEET_HANDLE);
  await s.drag(handle, { x: handle.x, y: handle.y + 190 }, 620);
}

export const CLIPS: Clip[] = [
  {
    name: "01-network-hero",
    title: "Cold open: the whole Addis network on one map, sheet swipes away",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await s.mark();
      await s.beat(700);
      await collapseSheet(s);
      await s.hideCursor();
      await s.beat(400);
      await s.camera({ zoom: 10.5, center: [38.7578, 9.0192], duration: 2600 });
      await s.beat(1400);
    },
  },
  {
    name: "02-network-tilt",
    title: "Cinematic tilt + rotate across the route network",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await collapseSheet(s);
      await s.hideCursor();
      await s.mark();
      await s.camera({ zoom: 12.4, center: [38.7700, 9.0150], pitch: 50, bearing: 28, duration: 4200 });
      await s.beat(1100);
    },
  },
  {
    name: "03-search-typing",
    title: "Searching a destination and watching routes surface live",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await s.mark();
      await s.tap(searchBox(s), { settle: 250 });
      await s.write(searchBox(s), HERO_ROUTE.query, { delay: 105 });
      await s.beat(2000);
    },
  },
  {
    name: "04-route-detail",
    title: "Tapping a result: the line draws itself, fare and headway appear",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      // Setup, trimmed away: get a result list on screen fast.
      await searchBox(s).fill(HERO_ROUTE.query);
      const result = s.page
        .locator("button:visible")
        .filter({ hasText: HERO_ROUTE.code })
        .first();
      await result.waitFor({ state: "visible", timeout: 15_000 });
      await s.beat(500);

      await s.mark();
      await s.tap(result, { settle: 900 });
      await s.mapIdle();
      await s.beat(2600);
    },
  },
  {
    name: "05-route-stops",
    title: "Expanding the route sheet and scrolling every stop on the line",
    signedIn: true,
    async run(s) {
      await s.goto(`/?route=16765470`);
      await s.mapIdle();
      await s.beat(400);
      await s.mark();
      await s.tap(SHEET_HANDLE, { settle: 700 });
      await s.scroll({ x: 180, y: 470 }, 560, 1500);
      await s.beat(900);
    },
  },
  {
    name: "06-layers-toggle",
    title: "Filtering the map by operator with the transit-layers panel",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await collapseSheet(s);
      await s.beat(300);
      await s.mark();
      await s.tap('button[aria-label="Transit layers"]', { settle: 700 });
      await s.tap('button:visible:has-text("Minibus Assoc.")', { settle: 900 });
      await s.tap('button:visible:has-text("Anbessa")', { settle: 1100 });
      await s.beat(700);
    },
  },
  {
    name: "07-my-location",
    title: "One tap to centre the map on where the rider is standing",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await collapseSheet(s);
      await s.beat(300);
      await s.mark();
      await s.tap('button[aria-label="My location"]', { settle: 1200 });
      await s.mapIdle();
      await s.beat(1800);
    },
  },
  {
    name: "08-directions-open",
    title: "Switching from Explore to the journey planner",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await s.beat(500);
      await s.mark();
      await s.tap(directionsTab(s), { settle: 1000 });
      await s.beat(1400);
    },
  },
  {
    name: "09-directions-plan",
    title: "Planning Megenagna → Mexico: two taps, one journey",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      await s.tap(directionsTab(s), { settle: 700 });
      await s.mark();

      const start = s.page.locator('input[aria-label="Choose start point"]:visible').first();
      await s.tap(start, { settle: 200 });
      await start.pressSequentially("Megenagna", { delay: 95 });
      await s.page.getByRole("option").first().waitFor({ timeout: 10_000 });
      await s.beat(600);
      await s.tap(s.page.getByRole("option").filter({ hasText: "Megenagna Terminal" }).first(), { settle: 500 });

      const dest = s.page.locator('input[aria-label="Choose destination"]:visible').first();
      await s.tap(dest, { settle: 200 });
      await dest.pressSequentially("Mexico", { delay: 95 });
      await s.page.getByRole("option").first().waitFor({ timeout: 10_000 });
      await s.beat(600);
      await s.tap(s.page.getByRole("option").first(), { settle: 600 });
      await s.beat(900);
    },
  },
  {
    name: "10-itinerary",
    title: "The result: which bus, how long, how many stops, how many birr",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      // Setup, trimmed away: get to a planned journey as fast as possible.
      // These are react-aria comboboxes — .fill() sets the text without ever
      // committing a selection, so the plan button stays disabled. Real key
      // events are required; only the delay is dropped to keep setup short.
      await directionsTab(s).click();
      const start = s.page.locator('input[aria-label="Choose start point"]:visible').first();
      await start.pressSequentially("Megenagna", { delay: 20 });
      await s.page.getByRole("option").filter({ hasText: "Megenagna Terminal" }).first().click();
      const dest = s.page.locator('input[aria-label="Choose destination"]:visible').first();
      await dest.pressSequentially("Mexico", { delay: 20 });
      await s.page.getByRole("option").first().click();

      await s.mark();
      await s.tap(planButton(s), { settle: 400 });
      await s.page
        .locator("text=/\\d+ min/")
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });
      await s.beat(900);
      await s.tap(SHEET_HANDLE, { settle: 800 });
      await s.scroll({ x: 180, y: 470 }, 520, 1600);
      await s.beat(1000);
    },
  },
  {
    name: "11-profile-level",
    title: "Rider profile: level, points, weekly streak and earned badges",
    signedIn: true,
    async run(s) {
      await s.goto("/profile");
      await s.beat(600);
      await s.mark();
      await s.scroll("body", 220, 1100);
      await s.beat(2200);
    },
  },
  {
    name: "12-contribution-history",
    title: "Contribution history: every approved fare edit, route by route",
    signedIn: true,
    async run(s) {
      await s.goto("/profile");
      await s.page.mouse.wheel(0, 260);
      await s.beat(700);
      await s.mark();
      await s.scroll("body", 300, 1300);
      await s.beat(2400);
    },
  },
  {
    name: "13-leaderboard",
    title: "The Fare Scouts leaderboard — riders ranked by approved fixes",
    signedIn: true,
    async run(s) {
      await s.goto("/leaderboard");
      await s.beat(800);
      await s.mark();
      await s.scroll("body", 520, 2000);
      await s.beat(1500);
    },
  },
  {
    name: "14-saved-routes",
    title: "The library rail: saved routes and recent searches",
    signedIn: true,
    async run(s) {
      await s.goto("/");
      // The rail's panel renders inside the sheet, so at the half snap there
      // is no room for the saved list — expand to full before opening it.
      await s.tap(SHEET_HANDLE, { settle: 800 });
      await s.beat(300);
      await s.mark();
      // The rail opens straight onto the saved-routes section, and its icons
      // are toggles — tapping "Saved routes" here would close what just opened.
      await s.tap('button[aria-label="Open library"]', { settle: 1400 });
      await s.beat(1600);
      await s.tap(s.page.getByRole("button", { name: "Recent searches" }).first(), {
        settle: 1400,
      });
      await s.beat(1400);
    },
  },
  {
    name: "15-amharic-toggle",
    title: "EN → አማ: the leaderboard re-renders in Amharic",
    signedIn: true,
    async run(s) {
      // Shot on /leaderboard deliberately. The public map has no next-intl
      // wiring yet (every string in public-map.tsx is hardcoded English), so
      // toggling there changes the pill and nothing else. The leaderboard is
      // translated, so this clip shows a real switch rather than a promise.
      await s.goto("/leaderboard");
      await s.beat(700);
      await s.mark();
      await s.tap('button[aria-label="አማርኛ"]', { settle: 2000 });
      await s.beat(1800);
      await s.scroll("body", 320, 1300);
      await s.beat(1200);
    },
  },
];
