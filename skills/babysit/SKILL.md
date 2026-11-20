---
name: babysit
description: Shepherds one or more open pull requests to merge. Watches CI and fixes or reruns failures, resolves conflicts with the base, addresses review comments from people and bots with commits, optionally runs an independent code review, and merges once green when told to. Use when the user says "babysit", "monitor the PR", "keep monitoring", "watch my PR", "check CI", "CI is red", "check comments on the PR", "work on the comments", "resolve conflicts", "mark ready for review and get it green", "merge when green", "merge after approval", "independent review", or "drive this PR to completion". A self-paced loop built on background monitors and scheduled wakeups; works in any project and assumes only git and the gh CLI.
---

# babysit

Shepherd open PRs until they merge: green CI, no conflict with the base, every comment worked, review findings triaged. Works on one PR or several, across repositories. The user should never be the first to report a red check, a new comment or a conflict.

## The loop

1. **Resolve the PRs.** `gh pr view <n> --repo <owner/repo> --json number,headRefName,baseRefName,statusCheckRollup,mergeStateStatus,mergeable,reviewDecision,isDraft`. Pass the PR number and repository to every command; a bare command resolves to whatever PR the current checkout belongs to, which is how the wrong PR gets watched. Draft PRs: heavy checks are often gated on ready; ask before undrafting unless the user already said "mark ready" or "drive to green".
2. **Arm monitors, don't poll in the foreground.** One bounded monitor per in-flight CI run; one persistent monitor for base movement, conflict state, new comments and review submissions. Events wake the loop through task notifications. Add a fallback `ScheduleWakeup` of 1200 to 1800 s.
3. **On each event, classify then act** (sections below).
4. **Re-verify after acting.** Re-read the checks and the thread. Never call green off stale state.
5. **Keep the loop alive.** Background monitors expire and die with the session. On every wake, on resume and after every push, confirm a monitor is armed for each watched PR and re-arm it.
6. **Loop until merged or closed.** After a merge, stop that PR's monitors, remove the worktree and local branch you created for it, then report what shipped and what is still open.

## CI events

| Signal | Class | Action |
|---|---|---|
| registry or network timeout, runner out of memory, a dead test environment, cancelled by concurrency | **infra flake** | `gh run rerun <id> --failed`. No code edits until infra is ruled out. |
| failed step is setup or a tool download, before any project command ran | **infra flake** | Rerun at once, without asking. |
| failure reproducible locally | **real** | Reproduce, fix the root cause in source, re-run that one check. |
| nondeterministic check fails on a case unrelated to the diff | **flaky test** | Rerun once. A second failure on the same case is real. |
| check also fails on the base branch | **pre-existing** | Prove it, report it, do not fix it in this PR. |
| fails only locally for missing secrets or services | **local only** | Trust CI for that check. |
| stale CANCELLED duplicates on the head (push and ready double-trigger) | **cosmetic** | Rerun the cancelled run to clear the merge box, or ignore if the latest run per check name is green. |

## Base branch

- Merge the base in when the PR conflicts, when a failing check needs the newer base, when the repo requires up-to-date branches, or when the user asks. Fix a conflict the moment it appears.
- Otherwise leave a green branch alone: each merge restarts CI and can import someone else's breakage.
- Merge, do not rebase or force-push, so review threads keep their anchors.
- After merging the base: regenerate anything that depends on base order (DB migration snapshots and journals), run the local gate, push.
- Stacked PRs: merge the parent branch into the child; retarget children to the parent's base before the parent merges; then re-verify the child's checks.

## Comments and reviews

Do not post on the PR. Fix accepted feedback with commits, resolve the fixed threads silently, and explain everything else to the user in chat.

| Comment | Action |
|---|---|
| Human change request | Verify against the actual code first; reviewers are sometimes wrong. If right: fix, push, resolve the thread, re-request review from that reviewer. If wrong: leave the thread open and give the user the two-line evidence in chat. |
| Human question | If the code answers it, draft the reply in chat and wait for the user to say post. |
| Nit or style comment | Apply if consistent with project rules and resolve. If it conflicts with repo conventions, skip it and tell the user which rule. |
| Bot review findings | They count. Verify each against the code, fix the necessary ones, skip the inapplicable ones and say why in chat. |
| Bot coverage, release or CI summary | Act only if it is a failing gate. |
| Approval | Report that the PR is mergeable; merge if the user told you to (see Merging). |

- A human comment outranks any bot finding: read it first.
- Watch issue-level comments as well as inline threads; review bots often post there.
- Track `last_seen` timestamps per source so nothing is handled twice.
- Resolve a thread: `gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<id>"}){thread{isResolved}}}'`.
- Post a reply only when the user asks for one. Then: one or two plain lines, the first line is the answer, teammate tone, no headers, no signature, in the language of the thread. `gh pr comment <n> --body ...` for issue-level comments; `gh api repos/{owner}/{repo}/pulls/{n}/comments/{id}/replies -f body=...` for inline threads.

## Merging

Default: propose the merge. If the user said to merge ("merge when green", "merge after approval"), merge once all of these hold on the current head commit:

- every required check green,
- review approved, unless the user waived approval for this PR,
- no unresolved thread and no unanswered human comment,
- no conflict with the base.

Re-read the head commit right before merging, because a late push invalidates the green. Use the repo's usual merge method. Never enable the platform's auto-merge; monitor and merge instead. Never merge someone else's PR or one the user asked to hold.

## Several PRs

One monitor script can watch them all. Work approved PRs first, then green ones, then the rest.

Report on state changes, not on every poll. For each PR give checks, review state, open threads, conflict state, the one thing it is waiting on and your next action. Use a table for more than two PRs. Re-read live state before answering a status question; a stale "still open" for a PR that already merged costs trust.

## Review mode ("independent review")

When asked for an independent review, run one at the start and after every substantial push:

- **Codex:** `codex exec --sandbox read-only --skip-git-repo-check - < prompt.md > out.md` (pipe the prompt on stdin; passing it as an argument can hang on "Reading additional input from stdin").
- **Headless Claude:** `claude -p "<review prompt>" --permission-mode plan` in the repo dir, as an alternative or a second opinion. Use whichever the user named; prefer a different model from the one that wrote the code, and use both when the change is risky (migrations, auth, tenancy).
- Give the reviewer the requirements, the changed-file list and the diff, never your conclusions, so its read stays independent. Ask for file:line findings, severity, a failing scenario, and refute before report.
- Triage each finding CONFIRMED or REFUTED against the actual code; independent reviewers hallucinate line numbers and invent requirements. Fix confirmed ones and fold them into the next push.
- Report the triage in chat, not on the PR: what was reviewed, what was fixed, what was rejected and why. Never paste raw reviewer output into the PR.

## Guardrails

- **Verify before fixing.** A red check or a review comment is a symptom, not a diagnosis. Read the log and the code first.
- **Local gate before a push**, mirroring CI (lint, typecheck, tests, and repo-specific checks such as unused-export scans and schema drift), unless the user says to just push.
- **Human gates:** approving, undrafting someone else's PR, anything shaped like billing or a deploy. Merging only as the Merging section allows.
- **Don't spam.** If nothing changed, say nothing.

## Monitor mechanics

- Read check state as structured output and test the states, never an exit code: `gh pr checks <n> --repo <owner/repo> --json name,state,bucket`. `--watch` exits when the watch ends, not when checks pass, and the plain command exits non-zero on pending or failing checks, which silently kills a naive loop.
- Treat an empty poll as a transient API error, not a change. Silence must never read as success.
- Bounded (one CI run to its conclusion): poll `gh run view <id> --json status,conclusion` every 60 s in a background task.
- Persistent (base, conflicts, comments, reviews): a single background loop, polling every 90 s, exiting on the first event:
  - base: `git ls-remote origin <base>`
  - conflict state: `gh pr view <n> --json mergeable,mergeStateStatus`
  - issue comments: `gh api repos/{o}/{r}/issues/{n}/comments?since=<ts>` (filter out your own login)
  - review comments: `gh api repos/{o}/{r}/pulls/{n}/comments?since=<ts>`
  - reviews: `gh api repos/{o}/{r}/pulls/{n}/reviews` filtered by `submitted_at > <ts>`
- On a wake with no event: re-check `gh pr view --json mergeStateStatus,reviewDecision` anyway; approvals don't always emit a watched event.
- Fallback `ScheduleWakeup` of 1200 to 1800 s with the same babysit prompt, so the loop survives killed monitors.
