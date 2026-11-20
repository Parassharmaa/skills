---
name: sonicboom
description: Ships one pull request end to end in any git repository. Takes a ticket or a plain request, builds it in its own git worktree, verifies it (tests, lint, a reproduction for bugs), captures screenshots and a video of the visible change, opens the PR, drives CI and review findings to green, merges under the agreed policy, then closes the ticket and cleans up. Also picks up part-way, from local changes that need a PR, a draft that needs evidence, or an open PR to take to merge. Assumes git worktrees, the gh CLI, optionally a ticket tracker (Jira, Linear or GitHub Issues) and a PR-review bot or human reviewers; the repo's own agent docs supply the coding rules. Use for "sonicboom PROJ-123", "ship this ticket", "work on it end to end and open a PR", "implement it and open a PR when done", "have a PR ready", "fix this bug and open a PR", or when several tickets should be built in parallel.
---

# Ship one PR, end to end

One ticket, one branch, one PR, merged. The work is done when the PR is merged into the base branch, the ticket is closed and the worktree is gone, not when the PR is opened.

Repository rules live in the repo's own agent docs (`AGENTS.md`, `CLAUDE.md`, rule files, the contributing guide). This skill is the delivery process around them and does not repeat them. Where a rule here and a repo rule disagree, the repo rule wins.

`<base>` below is the branch PRs target (`main`, `dev`, a release branch). Read it from the repo's default branch and contributing docs; do not guess.

This skill states the process and leaves most commands to you. Build, test, lint and database steps come from the repo's own docs; read them first.

## Start from where the work is

Check for an existing branch, worktree or PR before doing anything. Unpushed changes that need a PR: start at Verify. A draft PR: check its evidence and review state. An open PR: start at Monitor. Do not redo finished steps.

On every start or resume, sweep first: confirm your monitors are alive, remove your worktrees whose PRs merged or closed (after checking nothing is unpushed), and stop dev servers, browsers and agents you no longer need.

## 0. Scope the ticket

- Read the ticket with whatever the session has for the tracker (a Jira or Linear MCP server, `gh issue view`). The acceptance criteria are the scope.
- Finish the ticket in this PR. Leave a criterion out only when something outside the branch blocks it, and tell the user before opening the PR, not after.
- No ticket: a plain request is enough scope. Create a ticket only when the user asks for one or the team requires one for every PR; then copy the shape (type, parent, required fields) from a sibling ticket instead of guessing which fields the workflow demands.
- Claim a ticket you work from: assign it to the user, fill the estimate fields the team uses, and move it to In Progress. Some workflows reject a jump across statuses; walk the transitions in order.
- Check what else is in flight: open PRs touching the same files (`gh pr list --search`), and dependencies named in the ticket. Stack on an unmerged dependency only when you must, and say so in the PR body.
- A design question the ticket does not answer and the code cannot settle goes to the user once, with a recommendation. Everything else: decide, and record the decision in the PR body.

## 1. Worktree, database, app

Every ticket gets its own worktree, and its own database and port when the app needs them, so migrations and dev servers never collide.

```bash
git fetch origin <base>
git worktree add ../<repo>-<slug> -b <type>/<slug> origin/<base>
```

- If the repo ships a worktree setup script, use it instead: it knows which env files to copy, how to install dependencies and how to create the database.
- Set up only what the work needs: dependencies alone for docs, tooling and unit tests; a database for DB-backed tests; a running app for anything checked in the browser.
- Env files are not in git. Copy them from the main checkout, then change what must differ per worktree: database name, `PORT`, the app URL. Never commit them.
- Each parallel ticket gets a distinct port and its own database. Confirm the port serves your worktree before trusting the browser: `lsof -tiTCP:<port> -sTCP:LISTEN`, then `lsof -a -p <pid> -d cwd`.
- Before creating a worktree or starting a dev server, check free disk on the volume that holds the checkout. When it is tight (under about 20 GB), run one dev server at a time, clear the dev build cache after recording, and remove a PR's worktree once it is pushed. A dev server plus its first compiles can eat several GB; if free space drops under about 5 GB mid-task, finish the take already compiled, stop the server and clear your own build cache before the next build.
- Disk usage tools over-report worktrees when the package manager hard-links from a shared store, so expect to free less than they show. Never delete caches, stores or other people's worktrees without the user's yes; propose targets with sizes instead.
- Never `git stash` across worktrees; the stash is shared by all of them.
- A local setup fix you had to discover (a wrong port in a copied env file, a login provider to turn off locally) belongs in the repo's agent docs or your memory so the next run starts with it. It never belongs in the commit.

## 2. Implement

- Fix the root cause, in the place that owns it. Ask "why did this break?" until the answer is the project's own code or data, and change that. Do not add guards, provider-specific filters or workarounds downstream of a defect you could remove at its source; if a defensive layer still seems worth it, it is a separate ticket, not part of the fix.
- Bugs: reproduce first (a failing test, a script, or a browser repro with numbers). A fix without a reproduction is a guess; if you cannot reproduce, say so and stop before shipping a speculative change.
- Read the repo rules before writing, and follow them (tenant or account scoping on queries, translation coverage, comment policy, how tests reach the database). Do not infer the rules from neighbouring code.
- Tests describe behaviour, not this PR. Test what the unit must do for any input (accepts these, rejects those, persists across X), not the exact shape of today's diff or one vendor's quirks. No tests that only enumerate the one case that broke or snapshot a list of today's files.
- Generated files: run the generator, never hand-edit.
- A setting or view that mirrors an existing one (a second limit, a sibling toggle, another banner) shares that one's component and behaviour; extract the shared piece instead of copying it.
- Add the fewest tests that prove the behaviour: one test through the real user path beats several on internals.
- Keep the change to the ticket. Unrelated defects you notice go in a separate PR or a new ticket.
- Before opening the PR, read the whole diff and drop what the change does not need: plans, notes, runbooks, personal tooling, leftover debugging.

## 3. Verify

Match the check to the claim, and run it before claiming it.

- Targeted tests for the change, then the full suites of every touched package, with the environment the repo's test runner expects.
- Run what CI runs. Read the CI workflow (`.github/workflows/*`) and run its actual lint, typecheck and test script list, not the script names you remember; a top-level `lint` script can be a subset or a deprecated stub.
- CI and commit hooks are often stricter than the editor command: warnings fail the build, and an auto-fix run can hide rules the plain check reports. Run the checker in plain check mode on your files before committing.
- Re-run every lint after merging `<base>`; a merge can bring new rules that your files now break.
- Use the tool versions the repo pins (version files, a version manager) rather than whatever is on `PATH`.
- Failures that are your shell and not the code (env file not loaded, a pinned tool not on `PATH`): re-run them properly before reporting. Report the rest as real.
- Route tests that stub request parsing hide changes to the parser; when the change touches parsing, test through a real request with a real body.
- Measure memory in a fresh process running the real code path, or with warmed direct requests; a dev server swings hundreds of MB from page compiles alone.
- Bugs seen on a deployed environment: read that environment's logs first. Logs expire.
- Grep for every test that mocks or asserts what you changed (shapes, invalidation lists, call counts) and update them in the same commit.
- Bugs: re-run the reproduction and show before and after. With no worktree at hand, a probe script that imports only the libraries it needs from the main checkout is enough to re-check a schema or a provider call. For bugs in calls to an external API (request shapes, schemas, error handling), a short probe against the real API gives the fastest honest before and after, and doubles as PR evidence when a dev server is not possible.
- After a merge, if an end-to-end spec starts failing on `<base>`, bisect it against the merge commits. When CI only runs the specs a PR affects, a regression can hide until another PR touches the area.
- zsh expands a word starting with `=` (`echo ====` fails with "not found"); quote separators in chained commands.

### Independent review before the PR opens

Spawn a fresh subagent (not a fork, so it does not inherit your reasoning) to review the branch before you open or update the PR. Give it the ticket text, the base and head refs and the repo rules to apply, never your conclusions. Ask for: root cause actually fixed (or only a symptom guarded), correctness and edge cases, tenant and auth boundaries, migration and rollout safety, tests that assert behaviour versus tests that overfit the diff, and anything a reviewer would block on. It must not edit, push or post. Use a different model for it when one is available (a second CLI agent, another vendor). Fix what holds up, note what you rejected and why, then open the PR. Repeat after a large review-fix push.

A fork agent cannot spawn subagents. When the ticket runs as a fork, the fork opens the PR and reports its base and head; the parent session then runs this independent review and sends the findings back to the fork (or fixes them itself if the fork has finished).

## 4. Screenshots and video

Every PR carries screenshots and a video of what changed. UI change: the screen itself. Backend change: the user-visible path (a UI that shows the result, a CLI or API call and its output).

- Each screenshot shows the changed element in the state where it appears; seed data until it does. For a visual change give before and after from the same viewport and data, and check the two differ at a glance.
- Show the stills and the video to the user when you attach them (open the folder or the files); they review the evidence before reviewers do.
- A PR is not ready for review while its evidence is missing. If recording is blocked, say what blocks it at once; never leave a "pending" placeholder in the body.

- Record with plain Playwright from the worktree's `node_modules`; it is reliable for scripted takes. Copy `scripts/record.mjs` from this skill's folder to a scratch folder and fill in `steps()`. It signs in, presets localStorage keys, records the whole browser context, saves stills with `shot()`, and prints the video path and how many seconds of login to trim.
  `WORKTREE=<worktree> BASE=http://localhost:<port> LOGIN_URL=/login LOGIN_EMAIL=<local test user> LOGIN_PASSWORD=<its password> OUT=<scratch>/media node <scratch>/record.mjs`
- Seed the data the take needs through the real code path (import a file, upload, call the service) rather than raw SQL, unless a state cannot be reached otherwise; say so in the PR when you set state directly.
- Cold compiles: the first visit to each route after starting a dev server can take 30 s or more. Open each route once before recording, and give navigation a long timeout.
- When a full reload would hide the behaviour under test, navigate client-side (the script's `push()` does this for Next.js).
- A state change between steps (a background job editing a row, a CLI call) goes in `steps()` with `execSync` from `node:child_process`, so one recording shows the before and after.
- First-run dialogs, onboarding screens and permission prompts get in the way of takes. Preset their "seen" keys with `LOCAL_STORAGE`, or name their dismiss button in `DISMISS`. They can appear after a later navigation, not only after login, so the script's `goto()` checks after every load.
- A click that navigates away and removes its element can time out in Playwright while the navigation succeeds; click with a short timeout and wait on the URL (`clickAndWaitForUrl`).
- A state that needs external configuration (an API key, a connected account) is covered by a unit test or by configuring it locally, never skipped silently.
- Before and after on one dev server: commit the fix, `git checkout <merge-base> -- <changed files>` to capture the old behaviour with hot reload, then `git checkout HEAD -- .` to restore.
- Keep seed and recording scripts in the scratch folder, never inside the worktree, so a commit hook or `git add -A` cannot pick them up.
- Free disk by deleting the framework's build cache in place; moving it elsewhere on the same volume frees nothing.
- Before attaching, look at the stills and at a contact sheet of the video (`ffmpeg -i demo.mp4 -vf "fps=1/2,scale=480:-1,tile=5x4" -frames:v 1 sheet.png`). Trim the login and any error toast you did not mean to show (`ffmpeg -ss <sec> -i in.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an demo.mp4`). No emails, tokens or real customer data on screen.

## 5. Commit and open the PR

- Follow the repo's commit convention (subject length, case, prefixes); hooks may enforce it. Review fixes get their own commit; a follow-up that belongs to the feature is amended in before the PR opens.
- To collapse follow-up commits on a branch with merges in it before opening the PR: build a clean base (the base branch plus the needed merge), check out the final tree on top of it, and commit once; confirm the tree hash matches what you tested.
- Check `git status` for files you did not touch before committing.
- Open against `<base>` as draft or ready, whichever the user asked for this run (default ready), using the repo's title convention:
  `gh pr create --base <base> [--draft] --title "<what users can now do>" --body "Media uploading."`
- A draft is a short look-first window, not a parking spot: 10 to 15 minutes after a draft opens with its media, mark it ready (`gh pr ready <n>`) unless the user has said to keep it draft or has left feedback that is still open. Schedule that as a background timer the moment the draft opens, and cancel the timer if the user asks to hold.
- Many repos run only a reduced CI on drafts, so the local suites are the draft's real verification: run them all before opening a draft.
- Body: the repo's own convention wins (a PR template, the contributing guide, a PR-writing skill). Without one: a few plain sentences or short bullets on what users can now do (before, then after), one line on what proves it, then Screenshots and Demo. Keep it short; no pasted test output. Decisions a reviewer should see (a trade-off, a blocked criterion) go in the body in one line each, not in comments.
- Attach media from the media folder so relative paths resolve (needs a gh version with `--attach`):
  `gh pr edit <n> --body-file body.md --attach ./shot.png --attach ./demo.mp4`
  gh swaps `![](./shot.png)` in place but appends a video's URL at the end, so put no video path in the body (end it with the Demo heading) and let gh append it. Read the body back and confirm no `./` path or duplicate remains.
- The description describes the current head, not the history. After every push that changes behaviour, scope or approach, rewrite the affected bullets and re-run any evidence the body quotes (numbers, before and after calls) on the new head. Never leave a result that was measured on code you have since removed.

## 6. Free the disk, keep the PR moving

Once the PR is open with its media, the worktree can go when disk is tight: stop its dev server, `git worktree remove`, keep the remote branch and the per-PR database. To fix something later: `git fetch origin <branch> && git worktree add ../<repo>-<slug> <branch>`, then set it up again at the level the fix needs.

## 7. Monitor, address, fix

- Watch with a background monitor (polling `gh pr checks` and review state every 60 to 90 s), never foreground sleeps. Treat a blank poll as a transient API failure, not a change.
- What to watch on every open PR: checks on the current head, new reviews and review threads, new issue comments, `mergeable`, and whether `<base>` moved under it. A human comment or change request outranks every bot finding: read it first, act on it the same day.
- With several PRs open, work the one closest to merge first (approved, then green, then the rest).
- After each round, and whenever the user asks for status, give one table: PR, checks, review, open threads, next action.
- Triage every finding from the review bot and from humans:
  - Real defect or plan conflict: fix in code with a test, its own commit.
  - Deliberate difference or out of scope: one line in the PR body.
  - Do not reply on the PR unless the user asks; no "addressed in" comments. Resolve fixed threads silently (`gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<id>"}){thread{isResolved}}}'`).
  - After fixing a human reviewer's findings, resolve the threads and re-request their review.
  - A human asks a question you cannot answer from the code: tell the user in chat, with a draft reply, and wait.
- Feedback from the user on one PR is a rule for all of them: apply it to every open PR and every running agent the same day.
- Valid review findings and the user's follow-ups on the same feature go into this PR, not a follow-up PR. Batch them: each push restarts the whole suite, so after the first round push once per batch, and only for a real finding or a failing check.
- If the PR already merged, ship the remainder at once as a small follow-up.
- `<base>` moved and the PR conflicts: fix it the moment it appears. Merge `origin/<base>` in (no rebase once the PR is open, so review threads keep their anchors).
- Migration number collisions: take the base's migrations, delete yours, and regenerate with the repo's generator under the same name. Never predict a migration number for a stacked or parallel PR; the base can land several between pushes. Rebuild the local database and re-run the migration checks and DB tests afterwards.
- Once green, stop merging `<base>` in unless a conflict or a failing check needs it.

## 8. Merge and close out

- Merge policy is set per run. Read it from the request: on approval, when green with every comment addressed, or hold. With no instruction, require approval from a reviewer other than the author.
- Bypass a required approval only when the user said so for this repo, and never for a release branch, someone else's PR or a PR on hold.
- Always, whatever the policy: every check green on the current head, every finding fixed or answered, no unresolved threads, no conflict with the base, and the head SHA re-read right before merging.
- Changes pushed after the approval: before merging, leave one short PR comment listing what changed after approval. That is the only PR comment this skill posts without being asked.
- A PR just retargeted from a stacked base to `<base>` can show its old, partial checks for a few seconds. Never merge on those: wait until the full CI has registered and passed against the new base. Any merge-when-green automation must check the base and that the required checks are present, not only that nothing is red.
- Merge yourself, with the method the repo uses (`gh pr merge <n> --merge` or `--squash`). Do not turn on the platform's auto-merge unless asked; monitor and merge instead. Never `--delete-branch` from a worktree that has the branch checked out. Retarget stacked children first.
- After merge: ticket to Done, stop the dev server, `git worktree remove`, delete the local branch, drop the per-PR database.
- Tell the user: the PR link, what shipped in user terms, how it was verified, anything deliberately left out, and anything that still needs them.

## Several tickets at once

Work in batches (three tickets at a time unless the user says otherwise). Start the next ticket as soon as one opens its PR and frees its worktree, so the batch stays full; keep the critical-path ticket in every batch.

Run each ticket as its own agent with an explicit brief: ticket, branch, worktree path, port, database name, the rules above, and "do not merge; report PR, head, CI and findings". Different ports and databases per agent. Keep the merge and the ticket close-out in the main session, and answer each agent's progress pings in one line.

## Checklist

- [ ] Ticket read, criteria mapped, claimed (assignee, estimate, In Progress)
- [ ] Own worktree, database and port; env files adjusted and not committed
- [ ] Bug reproduced before the fix; reproduction re-run after; root cause fixed at its source
- [ ] Independent subagent review run before the PR opened; findings fixed or rejected with a reason
- [ ] Touched-package suites and every check the CI lint job runs are green locally
- [ ] Screenshots and video show the change, were shown to the user, login trimmed, no secrets on screen
- [ ] PR (draft or ready, as asked) against the base branch, media attached and body read back
- [ ] Every review finding fixed with a test or recorded in the body; threads resolved
- [ ] Merged under the agreed policy on a green, conflict-free head; post-approval note if needed
- [ ] Ticket Done; worktree, branch and database removed
