---
name: kirei
description: Audits a web app's UI for layout defects and visual noise, then ships the fixes as small, evidenced pull requests. Crawls screens at phone and desktop widths, opens menus and panels, measures overflow, clipping and overlap, groups findings by shared root cause, and fixes each group with before and after screenshots and a video. Use for "kirei", "UI audit", "UI review", "audit the UI", "audit spacing", "fix this padding or alignment", "refine this page", "improve this UI", "make it minimal, cleaner or more compact", "this looks inconsistent, redundant or misaligned", "the layout shifts", "check mobile layout", "do another pass", "audit similar instances on other screens", or a screenshot of a cluttered or broken screen. Assumes a locally runnable app, Playwright in the app's node_modules, and the gh CLI.
---

# Kirei: audit the UI, ship it clean

Kirei (綺麗) means clean and tidy. Unless the user asked only for suggestions, the job is not a report: it is a set of shipped fixes, each proved with pictures, plus a short list of what was checked and found fine.

Input: a page, an area or a screenshot. With no input, the scope is the whole app.

Repository rules and any design or delivery skill the repo has take precedence on how code is written and how PRs are opened. This skill decides what to look for, how to prove it, and how to ship it. When a PR-delivery skill is installed (for example `sonicboom`), use it for each PR.

## 1. Scope

- A screenshot or a named page: fix that, then **audit the same class of defect everywhere else** before calling it done. One reported instance usually has siblings.
- "Audit everything": list every route (from the router or the nav), then crawl in the order a user meets them.
- Read the ask for its gate. "Suggest" or "what should we improve" means a ranked list with screenshots, then wait. "Do not open the PR yet" means build it, show before and after, then wait. "Fix" or "keep opening PRs" means ship.
- Within that gate, decide alone. Product and design calls (what to hide, what to merge) are yours to make and record in the PR body. For a pure taste call, show two variants instead of asking an open question.

## 2. Look at it the way users do

Run the app locally with realistic data. Seed the states a screen can be in (empty, one item, many items, long names, CJK text, errors, a failed fetch), through the real code path where possible.

Crawl every in-scope screen at **390 x 844 with touch** and at **1440 x 900**, plus dark mode when the app has it. Use `scripts/crawl.mjs` from this skill's folder (see its header): it signs in with a form or a saved session, hides dev-only overlays, opens or hovers the controls you list, and per step reports page-level and container-level sideways scroll, controls that cross the viewport edge or are clipped by a parent, and headings or controls with something drawn over them. Run it once per size, and again with `COLOR_SCHEME=dark`; use `FULL_PAGE=1` for long pages.

Static page loads hide most defects. For each screen, **open the things that open**: toolbars, `+` buttons, kebab menus, filters, sort, pickers, popovers, side panels, dialogs, and re-measure. Then grep the code for floating UI with fixed desktop widths or anchor-computed positions and no mobile branch, to cover screens the crawl could not reach.

Look at every screenshot yourself. Numbers find overflow; only eyes find noise.

## 3. What to look for

**Breakage (fix first)**
- Toolbars or button rows wider than the screen; the first or last control unreachable.
- Popovers, palettes, floating panels opening partly off-screen, or positioned from an anchor with a fixed px width and no mobile alternative. On phones these belong in a bottom sheet.
- Layers in the wrong order: a page toolbar drawn over a full-screen overlay, chat or dialog. Check the z-index of everything fixed or absolute against the app's overlay layers, per breakpoint.
- Text that wraps or truncates badly with long or CJK content. Truncated text needs a way to read the whole thing (tooltip, expand, detail view).
- One element drawn over another: an action button on top of the page title, a badge over a label.

**Movement the user did not cause**
- Content that jumps when late data, a banner or a tab strip arrives. Remembered state (a collapsed panel) that flashes its default first. Lists or tables that resize while content streams in. Scroll position that jumps.
- Measure it: record `layout-shift` entries, or sample a landmark's position every 40 ms during a slowed load, and treat any move after first paint as a defect. Fix by loading with the page or reserving the space.

**Spacing and alignment**
- Uneven padding inside one container, siblings whose left edges or baselines do not line up, a gap above a block that is larger than the gap below it, indentation with no parent to explain it, a trailing control that no longer sits on the edge.
- Compare the same component on two screens: different padding is a defect in one of them. Measure boxes instead of trusting the eye, and fix the gap in the shared component, not with a margin at the call site.

**Hierarchy and affordance**
- More than three text sizes in one surface, or a heading far larger than its neighbours. Icons out of scale with their label.
- Clickable things that look static, and static things that look clickable. Two hover highlights on one row.
- Page actions floating in the body instead of beside the title. Dialog actions that scroll out of view. Controls shown when they have nothing to act on.

**Noise (fix in the same pass)**
- A second header line of metadata (size, type, date, IDs). Move it behind a tooltip or into a details surface; keep the line count of headers to one.
- Words nobody needs: a subtitle that restates the page title, helper paragraphs under settings, sentences describing how the system works inside. Delete them, or move the one useful sentence behind a help icon. A popover or panel gets a title, one compact row per setting, and at most one short helper line. Prefer the shortest label that is still a word the user knows.
- Repeated information: a count in the header and again in the section, a title that restates the empty state, two labels saying the same thing.
- Raw internal values shown to users: enum keys (`PAYMENT_FAILED`), processing states (`queued`), database IDs, bare file extensions used as type names. Use the app's existing human labels.
- Badge stacks and default-state badges ("Active" on every row). Show the exception, not the rule; secondary metadata becomes muted text or a count with a tooltip.
- Nested boxes and stacked borders, tall stat cards that could be one compact strip, card titles that repeat the page title.
- Inconsistent primitives: underline tabs next to pill tabs, two menus on one object, Title Case next to sentence case, hand-rolled empty states. Compare behaviour too: two ways to page a list, two icons for one action, two layouts for the same kind of settings. Pick the one the app uses most and convert the other.

**External surfaces** count too: link previews (Slack, Teams), emails, notifications. Audit their text the same way: what the thing is and where it lives, nothing internal.

## 4. Decide the fix

- Group findings by **shared root cause**: one component, one token, one helper. A defect class found across screens is one PR per shared cause: five screens with the same broken popover is one PR in the shared popover, not five patches. A pass over a single page or feature is one PR, unless the user asks for a different split.
- Fix at the owner. Change the shared component (and give it the missing size or variant) instead of overriding it at call sites.
- When the owner is shared, list its other usages first. If the defect exists only in one context, add a variant or prop and leave the default alone. Capture one unchanged usage before and after, and confirm the two images match.
- Keep desktop unchanged unless desktop was wrong. Scope mobile-only changes to the breakpoint the app's mobile hook uses, and check the class breakpoint matches it.
- Reuse what the app already has: its bottom sheet, tooltip, label strings and status messages. If two surfaces need the same new thing, extract it once.
- When a label changes, update every locale and the tests that query by that name.
- Dropping a control on mobile is fine only when the gesture covers it (pinch-zoom for zoom buttons). Never drop the only way to reach something (a link back to its source): shrink it to an icon instead.
- Hover-only information must also open on tap and be in the accessible name.
- Rank: breakage that blocks a task, then breakage that looks broken, then noise. Ship the first PR while auditing the rest.

## 5. Prove it

Every PR carries before and after, taken on the same data at the same size:

- Commit the fix, check out the base versions of the changed files, capture "before", then restore. Same dev server, same seed. "Before" must come from the base code, never from a different state of the new code.
- The shot must show the exact state the PR is about (the open menu, the selected tab, the long name).
- Before attaching, open the pair and name the difference in one sentence. If you cannot see it at thumbnail size, crop both to the changed region or mark it.
- Stack or tile before and after into one image per screen; add a short video of the interaction (open, use, close) for anything that moves.
- Phone-width shots for mobile fixes, desktop shots for desktop fixes, both when both change.
- Hide dev-only overlays (framework dev badges, debug toolbars) before capturing; they sit on top of corner controls and break clicks too.
- A surface you cannot screenshot locally (a chat link preview) gets a render built from the exact text the code produces, labelled as a render.
- Look at every frame before attaching. Trim logins, crop artifacts and stray toasts.

## 6. Ship and close

- One PR per root-cause group, opened ready unless the user asked for drafts. Body: before then after in user terms, short bullets, Tests, Screenshots, Demo. Record deliberate trade-offs as one line each.
- Tests assert behaviour that would catch the defect returning (the compact toolbar keeps every action reachable; the link preview shows no internal identifiers), not the diff.
- Triage every review finding: fix the real ones with code, note a deliberate choice in one line in the body, and skip what does not apply. Resolve fixed threads without replying.
- Merge only under the merge policy the user gave for this run; without one, leave green PRs for the user and say they are ready. Clean up worktrees, branches, local databases and dev build caches as each PR merges.

## 7. Report

End with: the merged and open PRs (what each fixes, in user terms), the screens audited and found fine, the screens or menus that could not be reached and why, and the backlog of noise findings not yet shipped, grouped and ranked. Never report a screen as clean that was only loaded and not opened.

## Gotchas

- `scrollWidth > innerWidth` misses clipped children inside `overflow-hidden` parents and sideways scroll inside an app shell that owns the scrolling; measure element boxes and tall containers too, skipping only real horizontal strips. The crawler's numbers are hints: a clean report with a broken screenshot means the measurement missed it, not that the screen is fine.
- A flex row with `justify-center` and overflow cuts off both ends unreachably; scroll strips start at the left edge.
- Mobile hooks often return `false` on the first render; anything that must not flash desktop UI on phones needs CSS breakpoints as well.
- Playwright `force` clicks land on whatever is on top; hide overlays first. A click that navigates can time out while the navigation succeeds; wait on the URL.
- Seeded data that is too short hides truncation bugs; always include one very long name and one non-Latin name.
- Fixed-width popovers inside a collision-aware primitive (Radix) usually fit; custom portals positioned from an anchor usually do not.
- Making something interactive (a tooltip trigger, a tappable icon) with a raw `<button>` can trip design-system lint rules; reach for the shared Button first, and run every lint the CI lint job runs before pushing.
