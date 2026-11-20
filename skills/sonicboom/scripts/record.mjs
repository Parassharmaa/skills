// Sonicboom recorder: signs in (optional), records the whole browser context to a
// video, saves stills, and prints the video path plus how many seconds of login to trim.
//
// Usage (copy to a scratch folder first, then fill in steps(); never keep it in the repo):
//   WORKTREE=<app checkout> BASE=http://localhost:3000 OUT=./media \
//   [LOGIN_URL=/login LOGIN_EMAIL=.. LOGIN_PASSWORD=..] \
//   [LOCAL_STORAGE='{"intro-seen":"true"}'] [DISMISS="Skip for now"] \
//   [VW=1440 VH=900] [HEADED=1] [CHANNEL=chrome] \
//   node record.mjs
//
// WORKTREE must have playwright installed (or set PLAYWRIGHT to its index.mjs).
// LOCAL_STORAGE presets keys before any page script runs (first-run dialogs, intros).
// DISMISS is the accessible name of a button to click whenever it shows up after a load.
//
// Helpers for steps(): goto(path), push(path), shot(name), pause(ms),
// dismiss(), clickAndWaitForUrl(locator, urlPart).

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const WORKTREE = process.env.WORKTREE ?? process.cwd();
const { chromium } = await import(
  process.env.PLAYWRIGHT ?? join(WORKTREE, "node_modules/playwright/index.mjs")
);

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? join(process.cwd(), "media");
const VW = Number(process.env.VW ?? 1440);
const VH = Number(process.env.VH ?? 900);
const LOGIN_URL = process.env.LOGIN_URL;
if (LOGIN_URL && !(process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD)) {
  throw new Error("LOGIN_URL is set: also set LOGIN_EMAIL and LOGIN_PASSWORD (a local test user).");
}
mkdirSync(OUT, { recursive: true });

const headless = process.env.HEADED !== "1";
const browser = await chromium
  .launch({ headless, channel: process.env.CHANNEL ?? "chrome" })
  .catch(() => chromium.launch({ headless }));
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: VW, height: VH } },
});
if (process.env.LOCAL_STORAGE) {
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, JSON.parse(process.env.LOCAL_STORAGE));
}
const videoStartedAt = Date.now();
const page = await context.newPage();

const pause = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

const dismiss = async () => {
  if (!process.env.DISMISS) return false;
  const button = page.getByRole("button", { name: process.env.DISMISS });
  if (!(await button.first().isVisible().catch(() => false))) return false;
  await button.first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  return true;
};

// Full navigation. Long timeout because a dev server compiles each route on first visit.
const goto = async (path) => {
  await page.goto(`${BASE}${path}`, { timeout: 240000 });
  if (await dismiss()) await page.goto(`${BASE}${path}`, { timeout: 240000 });
};

// Client-side navigation without a reload. Next.js only (uses window.next.router).
const push = async (path) => {
  await page.evaluate((target) => window.next.router.push(target), path);
  await page.waitForURL((url) => url.pathname + url.search === path, { timeout: 30000 });
};

// For clicks that navigate away and remove their own element.
const clickAndWaitForUrl = async (locator, urlPart) => {
  await locator.click({ timeout: 3000 }).catch(() => {});
  await page.waitForURL((url) => url.href.includes(urlPart), { timeout: 30000 });
};

if (LOGIN_URL) {
  await page.goto(`${BASE}${LOGIN_URL}`, { timeout: 240000 });
  await page.locator("input[type=email], input[name=email]").first().fill(process.env.LOGIN_EMAIL);
  await page.locator("input[type=password]").first().fill(process.env.LOGIN_PASSWORD);
  await page.locator("button[type=submit]").first().click();
  await page.waitForURL((url) => !url.pathname.startsWith(LOGIN_URL), { timeout: 120000 });
  await dismiss();
}
const loggedInAt = Date.now();

async function steps() {
  await goto("/");
  await pause(2000);
  await shot("1-start");
}

await steps();
const video = page.video();
await context.close();
await browser.close();
console.log(
  JSON.stringify({
    video: await video.path(),
    trimSeconds: LOGIN_URL ? Math.round((loggedInAt - videoStartedAt) / 100) / 10 + 1 : 0,
    out: OUT,
  })
);
