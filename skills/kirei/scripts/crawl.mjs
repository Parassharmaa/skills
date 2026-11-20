// Kirei crawler: visits screens at one viewport, optionally opens or hovers controls,
// and reports layout problems plus a screenshot per step.
//
// Usage (copy to a scratch folder first; never run it from inside the repo):
//   PLAYWRIGHT=<app>/node_modules/playwright/index.mjs \
//   BASE=http://localhost:3000 PLAN=plan.json OUT=./kirei-out VW=390 VH=844 \
//   [LOGIN_URL=/login LOGIN_EMAIL=.. LOGIN_PASSWORD=..]   form sign-in, or
//   [STORAGE_STATE=state.json]                            a saved Playwright session (SSO, cookies)
//   [COLOR_SCHEME=dark] [FULL_PAGE=1] [HEADED=1] [CHANNEL=chrome] [KEEP_OVERLAYS=1] \
//   node crawl.mjs
//
// plan.json:
//   { "routes": [ { "path": "/settings",
//                   "open": [ "button[aria-label='Filters']",
//                             { "role": "button", "name": "New" },
//                             { "hover": "[data-testid='row-status']" } ] } ],
//     "localStorage": { "intro-seen": "true" } }
//
// Output: one JSON line per step on stdout and <OUT>/<nn>-r<route>-<target>.png.
//   docOverflow  page-level horizontal overflow in px
//   offenders    visible controls, tables, images and code blocks that cross the viewport
//                edge ("offscreen") or are cut by an overflow-hidden ancestor ("clipped").
//                Elements inside a real horizontal scroller are skipped.
//   sideways     tall containers (a page shell, a panel) that scroll horizontally. Short
//                strips are treated as intentional scrollers and not listed.
//   covered      headings and controls with something else drawn over their centre.
// The numbers are hints. Look at every screenshot yourself.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

for (const name of ["PLAYWRIGHT", "PLAN"]) {
  if (!process.env[name]) throw new Error(`Set ${name} (see the header of this file).`);
}
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./kirei-out";
const VW = Number(process.env.VW ?? 390);
const VH = Number(process.env.VH ?? 844);
const FULL_PAGE = process.env.FULL_PAGE === "1";
const plan = JSON.parse(readFileSync(process.env.PLAN, "utf8"));
mkdirSync(OUT, { recursive: true });

const headless = process.env.HEADED !== "1";
const browser = await chromium
  .launch({ headless, channel: process.env.CHANNEL ?? "chrome" })
  .catch(() => chromium.launch({ headless }));
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  isMobile: VW < 768,
  hasTouch: VW < 768,
  ...(process.env.COLOR_SCHEME ? { colorScheme: process.env.COLOR_SCHEME } : {}),
  ...(process.env.STORAGE_STATE ? { storageState: process.env.STORAGE_STATE } : {}),
});
if (plan.localStorage) {
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, plan.localStorage);
}
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

if (process.env.LOGIN_URL) {
  await page.goto(BASE + process.env.LOGIN_URL, { timeout: 240000 });
  await page.locator("input[type=email], input[name=email]").first().fill(process.env.LOGIN_EMAIL);
  await page.locator("input[type=password]").first().fill(process.env.LOGIN_PASSWORD);
  await page.locator("button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith(process.env.LOGIN_URL), { timeout: 120000 });
}

// Framework dev badges sit on corner controls and swallow clicks. KEEP_OVERLAYS=1 skips
// the corner heuristic if the app has its own small fixed launcher in a bottom corner.
const hideDevOverlays = () =>
  page.evaluate((keep) => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal,vite-error-overlay{display:none!important}";
    document.head.appendChild(style);
    if (keep) return;
    for (const [x, y] of [[innerWidth - 30, innerHeight - 30], [30, innerHeight - 30]]) {
      for (let el = document.elementFromPoint(x, y); el && el !== document.body; el = el.parentElement) {
        if (getComputedStyle(el).position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 120 && r.height < 120 && !el.closest("main,[role=dialog]")) {
          el.style.setProperty("display", "none", "important");
        }
        break;
      }
    }
  }, process.env.KEEP_OVERLAYS === "1");

const measure = (step) =>
  page.evaluate((step) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const label = (el) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 50)}"`;
    const visible = (el, r, st) =>
      r.width >= 8 && r.height >= 8 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) !== 0;

    const offenders = [];
    const seen = new Set();
    const selector =
      "button,a,input,select,textarea,table,img,pre,[role=grid],[role=menu],[role=dialog],[role=listbox],[role=tab],[role=tooltip],[data-radix-popper-content-wrapper]";
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!visible(el, r, st)) continue;
      let problem = null;
      let inScroller = false;
      if (st.position !== "fixed") {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (/(auto|scroll)/.test(ox) && p.scrollWidth > p.clientWidth + 1) {
            inScroller = true;
            break;
          }
          if (/(hidden|clip)/.test(ox)) {
            const pr = p.getBoundingClientRect();
            if (r.right > pr.right + 2 || r.left < pr.left - 2) {
              problem = "clipped";
              break;
            }
          }
        }
      }
      if (inScroller) continue;
      if (!problem && (r.left < -2 || r.right > vw + 2)) problem = "offscreen";
      if (!problem) continue;
      const key = `${label(el)}:${Math.round(r.left)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offenders.push(`${problem} ${label(el)} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
    }

    const covered = [];
    const floating = "[role=dialog],[role=menu],[role=listbox],[role=tooltip],[data-radix-popper-content-wrapper],dialog";
    for (const el of document.querySelectorAll("h1,h2,h3,button,a,input,select,textarea,[role=tab]")) {
      const r = el.getBoundingClientRect();
      if (!visible(el, r, getComputedStyle(el))) continue;
      // Headings are block-wide with text at the start, so sample the start as well as the centre.
      const xs = /^H[1-3]$/.test(el.tagName) ? [r.left + Math.min(12, r.width / 4), r.left + r.width / 2] : [r.left + r.width / 2];
      const y = r.top + r.height / 2;
      const top = xs
        .filter((x) => x >= 0 && x <= vw && y >= 0 && y <= vh)
        .map((x) => document.elementFromPoint(x, y))
        .find((hit) => {
          if (!hit || el.contains(hit) || hit.contains(el)) return false;
          if (hit.closest("label")?.contains(el) || hit.closest(floating)) return false;
          const hr = hit.getBoundingClientRect();
          return hr.width * hr.height <= vw * vh * 0.6;
        });
      if (!top) continue;
      covered.push(`${label(el)} under ${label(top)}`);
    }

    const sideways = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.scrollWidth <= el.clientWidth + 1 || el.clientHeight < vh * 0.5) continue;
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowX)) continue;
      const name = el.id ? `#${el.id}` : el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/)[0]}` : "";
      sideways.push(`${el.tagName.toLowerCase()}${name} scrolls sideways by ${el.scrollWidth - el.clientWidth}px`);
    }

    return {
      ...step,
      url: location.pathname + location.search,
      docOverflow: document.documentElement.scrollWidth - vw,
      sideways: sideways.slice(0, 5),
      offenders: offenders.slice(0, 15),
      covered: [...new Set(covered)].slice(0, 10),
    };
  }, step);

let n = 0;
const slug = (text) => text.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 40);
const capture = async (routeIndex, route, target) => {
  const shot = `${String(++n).padStart(2, "0")}-r${routeIndex}-${slug(target ?? "page")}.png`;
  await page.screenshot({ path: join(OUT, shot), fullPage: FULL_PAGE });
  console.log(JSON.stringify(await measure({ shot, route, target: target ?? null })));
};

const firstVisible = async (locator) => {
  for (const candidate of await locator.all()) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
};

for (const [index, route] of plan.routes.entries()) {
  const routeIndex = index + 1;
  try {
    await page.goto(BASE + route.path, { timeout: 240000 });
    await pause(3000);
    await hideDevOverlays();
    await capture(routeIndex, route.path);
  } catch (error) {
    console.log(JSON.stringify({ route: route.path, error: String(error.message).slice(0, 160) }));
    continue;
  }
  for (const target of route.open ?? []) {
    const hover = typeof target === "object" && target.hover;
    const name = typeof target === "string" ? target : hover ? `hover ${target.hover}` : target.name;
    try {
      const locator = hover
        ? page.locator(target.hover)
        : typeof target === "string"
          ? page.locator(target)
          : page.getByRole(target.role, { name: target.name });
      const element = await firstVisible(locator);
      if (!element) {
        console.log(JSON.stringify({ route: route.path, target: name, skipped: "no visible match" }));
        continue;
      }
      if (hover) await element.hover({ timeout: 5000 });
      else await element.click({ timeout: 5000 }).catch(() => element.click({ force: true }));
      await pause(1200);
      await capture(routeIndex, route.path, name);
    } catch (error) {
      console.log(JSON.stringify({ route: route.path, target: name, error: String(error.message).slice(0, 160) }));
    }
    // Reset for the next target; a failed target must not abort the rest of the route.
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.move(0, 0).catch(() => {});
    await pause(500);
    if (new URL(page.url()).pathname !== new URL(BASE + route.path).pathname) {
      await page.goto(BASE + route.path, { timeout: 240000 }).catch(() => {});
      await pause(1500);
      await hideDevOverlays().catch(() => {});
    }
  }
}

await browser.close();
