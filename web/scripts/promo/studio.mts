/**
 * Recording engine for the promo clips.
 *
 * Everything here exists to make a headless browser look like a person using a
 * phone: a visible cursor (Playwright's real pointer is invisible to the video
 * encoder), human-paced typing, eased drags, and camera moves driven through
 * MapLibre's own animation API rather than by faking scroll wheels.
 *
 * Frame geometry is fussier than it looks. Playwright's video encoder captures
 * the compositor surface and only ever scales *down* to `recordVideo.size`, so
 * a context `viewport` + `deviceScaleFactor` renders a 360x640 page into the
 * corner of a 1080x1920 file. The combination that actually yields a native
 * 9:16 frame is a browser-level `--force-device-scale-factor=3` with
 * `--window-size=360,640` and `viewport: null`, which leaves the page at a
 * 360px CSS width (so Tailwind stays below its `sm` breakpoint and the app
 * keeps its mobile layout) while devicePixelRatio is a true 3 — meaning
 * MapLibre also allocates a 1080x1920 canvas instead of an upscaled one.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export const FRAME = { width: 360, height: 640, scale: 3 } as const;
export const VIDEO_SIZE = {
  width: FRAME.width * FRAME.scale,
  height: FRAME.height * FRAME.scale,
} as const;

/** Addis Ababa city centre — the camera's home position. */
export const ADDIS = { lng: 38.7578, lat: 9.0192 } as const;

export interface SessionCookie {
  name: string;
  value: string;
}

/** Overlay: fake cursor, tap ripples, and a few recording-only style fixes. */
const OVERLAY_SCRIPT = `(() => {
  // tsx compiles via esbuild with keepNames, which wraps every function in a
  // __name() helper. Playwright serialises page.evaluate callbacks as source,
  // so that helper travels into the page where it does not exist. Shim it.
  if (typeof window.__name !== "function") window.__name = function (f) { return f; };

  const CURSOR_ID = "promo-cursor";

  function install() {
    if (!document.body || document.getElementById(CURSOR_ID)) return;
    const style = document.createElement("style");
    style.textContent = [
      "#" + CURSOR_ID + "{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;",
      "border-radius:50%;background:rgba(32,33,36,.38);border:2px solid rgba(255,255,255,.92);",
      "box-shadow:0 2px 12px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;",
      "opacity:0;transform:translate3d(-200px,-200px,0) scale(1)}",
      "#" + CURSOR_ID + ".on{opacity:1}",
      ".promo-ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;",
      "background:rgba(26,115,232,.30);border:2px solid rgba(26,115,232,.55);",
      "z-index:2147483646;pointer-events:none;animation:promo-ripple .6s ease-out forwards}",
      "@keyframes promo-ripple{to{transform:scale(4);opacity:0}}",
      "::-webkit-scrollbar{width:0!important;height:0!important}",
      "*{-webkit-tap-highlight-color:transparent!important}",
      // next.config sets devIndicators:false, but the dev error overlay is a
      // separate portal that still appears (as a red "N Issue" pill) on any
      // warning — including ones from an unrelated HMR rebuild. It must never
      // reach the footage.
      "nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay]{display:none!important}",
      // Focus rings read as debug chrome on camera, not as product polish.
      "*:focus,*:focus-visible{outline:none!important}",
    ].join("");
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = CURSOR_ID;
    document.body.appendChild(cursor);
  }

  function el() {
    install();
    return document.getElementById(CURSOR_ID);
  }

  window.__promoMove = function (x, y, ms) {
    const c = el();
    if (!c) return;
    c.style.transition =
      "transform " + ms + "ms cubic-bezier(.32,.08,.24,1), opacity .3s ease";
    c.classList.add("on");
    c.style.transform = "translate3d(" + x + "px," + y + "px,0) scale(1)";
  };

  window.__promoPress = function (x, y, down) {
    const c = el();
    if (!c) return;
    c.style.transition = "transform 110ms ease, opacity .3s ease";
    c.style.transform =
      "translate3d(" + x + "px," + y + "px,0) scale(" + (down ? 0.72 : 1) + ")";
    if (!down) return;
    const r = document.createElement("div");
    r.className = "promo-ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    document.body.appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
  };

  window.__promoHide = function () {
    const c = el();
    if (c) c.classList.remove("on");
  };

  /**
   * Reach the live MapLibre instance. react-map-gl keeps it private, so walk
   * up the React fiber from the map container until an object with the Camera
   * API turns up. Cached, because the walk is only cheap the first time.
   */
  window.__promoMap = function () {
    if (window.__promoMapCache) return window.__promoMapCache;
    const host = document.querySelector(".maplibregl-map");
    if (!host) return null;
    const key = Object.keys(host).find(function (k) {
      return k.startsWith("__reactFiber$");
    });
    if (!key) return null;
    const isMap = function (v) {
      return v && typeof v === "object" &&
        typeof v.flyTo === "function" && typeof v.getZoom === "function";
    };
    let node = host[key];
    let hops = 0;
    while (node && hops < 80) {
      hops++;
      const probes = [node.stateNode, node.memoizedState, node.memoizedProps];
      for (const p of probes) {
        if (isMap(p)) { window.__promoMapCache = p; return p; }
        if (!p || typeof p !== "object") continue;
        for (const k of Object.keys(p)) {
          let v;
          try { v = p[k]; } catch (e) { continue; }
          if (isMap(v)) { window.__promoMapCache = v; return v; }
          if (v && typeof v === "object") {
            if (isMap(v.current)) { window.__promoMapCache = v.current; return v.current; }
            if (isMap(v._map)) { window.__promoMapCache = v._map; return v._map; }
          }
        }
      }
      node = node.return;
    }
    return null;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();`;

type Target = string | Locator | { x: number; y: number };

export interface Studio {
  page: Page;
  /**
   * Milliseconds from context start to the clip's featured action, or null
   * when the whole take is wanted. The encoder trims to this, which is how a
   * clip can do slow, reliable setup and still cut to 8 seconds.
   */
  markedAt: number | null;
  /** Mark "the interesting part starts here" — everything before is trimmed. */
  mark(): Promise<void>;
  /** Navigate and wait until the page (and map, if present) has settled. */
  goto(path: string): Promise<void>;
  /** Hold the shot for `ms` — the pause that makes footage readable. */
  beat(ms: number): Promise<void>;
  /** Glide the cursor to a target without clicking. */
  moveTo(target: Target, ms?: number): Promise<void>;
  /** Glide, press, ripple, click. */
  tap(target: Target, opts?: { moveMs?: number; settle?: number }): Promise<void>;
  /** Type into the target field at a human cadence. */
  write(target: string | Locator, text: string, opts?: { delay?: number }): Promise<void>;
  /** Eased pointer drag, for the bottom sheet and map panning. */
  drag(from: Target, to: Target, ms?: number): Promise<void>;
  /** Smooth wheel-scroll inside a scrollable region. */
  scroll(target: Target, dy: number, ms?: number): Promise<void>;
  /** Animate the MapLibre camera and wait for it to land. */
  camera(opts: Record<string, unknown>, kind?: "easeTo" | "flyTo"): Promise<void>;
  /** Wait for MapLibre to finish loading tiles and settle. */
  mapIdle(timeout?: number): Promise<void>;
  /** Hide the cursor (e.g. before a pure camera move). */
  hideCursor(): Promise<void>;
  /** Resolve a locator to viewport coordinates. */
  at(selector: string, opts?: { nth?: number }): Promise<{ x: number; y: number }>;
}

function isLocator(t: Target): t is Locator {
  return typeof t === "object" && t !== null && "boundingBox" in t;
}

async function resolve(page: Page, target: Target): Promise<{ x: number; y: number }> {
  if (typeof target !== "string" && !isLocator(target)) return target;
  const loc = isLocator(target) ? target.first() : page.locator(target).first();
  await loc.waitFor({ state: "visible", timeout: 15_000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no bounding box for ${String(target)}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function makeStudio(page: Page): Studio {
  const t0 = Date.now();

  const studio: Studio = {
    page,
    markedAt: null,

    async mark() {
      studio.markedAt = Date.now() - t0;
    },

    async beat(ms) {
      await page.waitForTimeout(ms);
    },

    async goto(path) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      // Only map pages have a canvas; everything else just needs a settle.
      if (await page.locator(".maplibregl-map").count()) await studio.mapIdle();
      await page.waitForTimeout(400);
    },

    async moveTo(target, ms = 620) {
      const { x, y } = await resolve(page, target);
      await page.evaluate(
        ([px, py, d]) => (window as never as PromoWindow).__promoMove(px, py, d),
        [x, y, ms] as const,
      );
      await page.mouse.move(x, y, { steps: 12 });
      await page.waitForTimeout(ms);
    },

    async tap(target, opts = {}) {
      const { moveMs = 620, settle = 420 } = opts;
      const { x, y } = await resolve(page, target);
      await studio.moveTo({ x, y }, moveMs);
      await page.evaluate(
        ([px, py]) => (window as never as PromoWindow).__promoPress(px, py, true),
        [x, y] as const,
      );
      await page.waitForTimeout(120);
      await page.mouse.click(x, y);
      await page.evaluate(
        ([px, py]) => (window as never as PromoWindow).__promoPress(px, py, false),
        [x, y] as const,
      );
      await page.waitForTimeout(settle);
    },

    async write(target, text, opts = {}) {
      const { delay = 110 } = opts;
      const loc = (typeof target === "string" ? page.locator(target) : target).first();
      await loc.pressSequentially(text, { delay });
    },

    async drag(from, to, ms = 700) {
      const a = await resolve(page, from);
      const b = await resolve(page, to);
      await studio.moveTo(a, 480);
      await page.evaluate(
        ([px, py]) => (window as never as PromoWindow).__promoPress(px, py, true),
        [a.x, a.y] as const,
      );
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();

      const steps = Math.max(14, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        await page.mouse.move(x, y);
        await page.evaluate(
          ([px, py]) => (window as never as PromoWindow).__promoMove(px, py, 0),
          [x, y] as const,
        );
        await page.waitForTimeout(ms / steps);
      }
      await page.mouse.up();
      await page.evaluate(
        ([px, py]) => (window as never as PromoWindow).__promoPress(px, py, false),
        [b.x, b.y] as const,
      );
      await page.waitForTimeout(500);
    },

    async scroll(target, dy, ms = 900) {
      const { x, y } = await resolve(page, target);
      await studio.moveTo({ x, y }, 400);
      // Many small deltas read as a flick on camera; one big delta reads as a jump.
      const steps = Math.max(10, Math.round(ms / 40));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(ms / steps);
      }
      await page.waitForTimeout(350);
    },

    async camera(opts, kind = "easeTo") {
      await page.evaluate(
        async ([o, k]) => {
          const w = window as never as PromoWindow;
          const map = w.__promoMap();
          if (!map) return;
          await new Promise<void>((res) => {
            const done = () => res();
            map.once("moveend", done);
            // Safety net: a camera move interrupted by another never fires moveend.
            setTimeout(done, ((o as { duration?: number }).duration ?? 1000) + 1500);
            (map[k as "easeTo"] as (a: unknown) => void)(o);
          });
        },
        [opts, kind] as const,
      );
      await page.waitForTimeout(250);
    },

    async mapIdle(timeout = 20_000) {
      await page
        .waitForFunction(
          () => {
            const map = (window as never as PromoWindow).__promoMap();
            return !!map && map.loaded() && map.areTilesLoaded();
          },
          undefined,
          { timeout },
        )
        .catch(() => {
          /* Recording should continue on a slow tile server, not abort. */
        });
    },

    async hideCursor() {
      await page.evaluate(() => (window as never as PromoWindow).__promoHide());
    },

    async at(selector, opts = {}) {
      const loc = page.locator(selector).nth(opts.nth ?? 0);
      await loc.waitFor({ state: "visible", timeout: 15_000 });
      const box = await loc.boundingBox();
      if (!box) throw new Error(`no bounding box for ${selector}`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
  };

  return studio;
}

interface PromoWindow {
  __promoMove(x: number, y: number, ms: number): void;
  __promoPress(x: number, y: number, down: boolean): void;
  __promoHide(): void;
  __promoMap(): {
    once(ev: string, cb: () => void): void;
    loaded(): boolean;
    areTilesLoaded(): boolean;
    easeTo(o: unknown): void;
    flyTo(o: unknown): void;
  } | null;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      // Headless Chromium defaults to SwiftShader; ANGLE/Metal gives the map
      // real GPU rasterisation, which is the difference between a smooth pan
      // and a slideshow.
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      // See the frame-geometry note at the top of the file: these two, not the
      // per-context viewport options, are what produce a native 1080x1920 frame.
      `--force-device-scale-factor=${FRAME.scale}`,
      `--window-size=${FRAME.width},${FRAME.height}`,
    ],
  });
}

export async function newClipContext(
  browser: Browser,
  outDir: string,
  opts: { cookie?: SessionCookie; baseURL: string },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: opts.baseURL,
    // Deliberately null: any per-context viewport re-applies a device-metrics
    // override that resets devicePixelRatio to 1 and undoes the launch flags.
    viewport: null,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "Africa/Addis_Ababa",
    geolocation: { latitude: ADDIS.lat, longitude: ADDIS.lng },
    permissions: ["geolocation"],
    recordVideo: { dir: outDir, size: { width: VIDEO_SIZE.width, height: VIDEO_SIZE.height } },
  });

  await ctx.addInitScript(OVERLAY_SCRIPT);
  if (opts.cookie) {
    await ctx.addCookies([
      {
        name: opts.cookie.name,
        value: opts.cookie.value,
        url: opts.baseURL,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  }
  return ctx;
}
