---
name: pr-pal
description: Reviews someone else's pull request draft-first. Explains the change in plain words, weighs whether it is needed and what it costs, keeps only realistic findings, shows numbered draft comments in chat before anything is posted, and approves silently when authorized. Use for a PR URL or number (with or without "approve if all good"), "review this PR", a pasted list of PRs, an author's open queue, a re-review after new pushes, "watch this PR and approve when good", or drafting a PR comment in this style. Repository rules supply the technical checks; assumes the gh CLI.
---

# PR Pal

Review in chat first. Help the user understand the change and decide which findings deserve action. This skill captures a review style; it grants no permission to post, approve, merge, push fixes, or access production.

With only a URL or a number: review, explain, list drafts, give a verdict, and post or approve nothing. Accept URLs with extra path segments or query strings (`/changes`, `/files`, tracking parameters).

## Resolve the PR queue

When the user names an author, a team, or "open PRs" (no specific numbers), fetch the queue yourself. Don't ask for PR numbers.

- Map a person's name to a login from the repository's contributors (`gh api repos/{owner}/{repo}/contributors`, or `gh pr list --search "author:<guess>"`); ask if two logins fit.
- `gh pr list --state open --author <login> --limit 100 --json number,title,isDraft,reviewDecision,headRefOid,additions,deletions,changedFiles,updatedAt`
- Show the full list as a table (PR, draft, review decision, size, title) before reviewing.
- Review queue = non-draft PRs with no current approval from the user, newest first unless the user gives an order. Skip drafts and PRs already approved at the current head; list them as skipped. Re-review a PR the user approved earlier only if its head moved since that approval.
- Run the PRs as a repeatable batch: fan out independent static reviews in parallel (one subagent per non-trivial PR, read-only, told never to post, approve, or switch the user's branch; read files via `git show <sha>:<path>`), review tiny PRs directly, then report and act on each PR in list order. Pin approvals to the explicit reviewed SHA, never `FETCH_HEAD` (parallel fetches overwrite it).
- End with a status table: approved, approved with comments, held, or skipped, plus the head SHA for each.

## Establish scope and authority

- A request to review authorizes inspection. Findings remain drafts until the user explicitly authorizes posting them.
- "Review and approve if all good" authorizes approval after a review with no blocking findings. Complete it without another confirmation. Non-blocking findings do not hold the approval: approve, show their drafts, and ask once whether to post them, unless the user already said to leave comments and approve.
- Blocking findings hold the approval. Present the drafts and wait, unless the user explicitly accepts those findings and authorizes approval anyway.
- "Watch this PR and approve when good" is the authorization for the later approval: re-check each new head and approve once every blocking finding is resolved.
- Submit the approval review with an empty body. Silent approval is the default; use a body only if the user asks for specific wording for this approval.
- Approval, posting comments, fixing code, and merging are separate actions. Authorization for one does not authorize the others. Preserve per-PR exclusions, draft status, and any earlier authorization in this chat.

## Review the actual change

1. Resolve the repository, PR, actual base, and current head SHA. Inspect its description, full diff, existing review threads, and current checks. An unrelated checkout is not the PR under review.
2. Follow the repository's own agent and review rules (`AGENTS.md`, `CLAUDE.md`, path rules); they supply the technical checks. Cover correctness, access control, design, and rollout safety as the diff warrants. Keep technical rules in their owning repository rather than duplicating them here.
3. Before line-level findings, answer three questions: is this change needed, is there a simpler way to get the same result, and what does it cost at runtime (extra calls, latency, failure modes, false positives). If the answer is "not needed", back it with a measurement or a comparison; questioning a whole PR needs stronger evidence than a line comment.
4. Trace suspected defects through callers and the base implementation. State a concrete trigger, actual behavior, expected behavior, and user or operational consequence. Check whether the defect was introduced by this PR.
5. Challenge each finding: is it realistic and worth fixing? Prioritize data corruption, access leaks, broken behavior, races, rollout incompatibility, and concrete design liabilities. Drop trivial preferences and unsupported hypothetical bugs.
6. Sort what survives as **blocking** (data loss, access leak, broken behavior, a regression users will hit) or **non-blocking** (everything else worth saying). Keep optional UX and design suggestions distinct from defects.
7. A pre-existing problem or a larger idea is not a review comment. Report it in chat and offer a draft issue or a separate follow-up change.
8. Match verification to the claim and repository constraints. Read relevant CI results and logs for the reviewed commit. Run focused local checks or reproductions only where permitted; a static review means using source and CI evidence. Production inspection needs appropriate authorization.
9. For a batch, finish and report each PR in the requested order. When PRs touch the same contracts, inspect their interaction too.

Use an isolated checkout when needed and preserve the user's working changes. Reuse installed dependencies across review checkouts; a full install per PR can exhaust disk space. Report environment failures separately from source defects, and keep verification claims exact.

### Hands-on trial

For a change with visible behavior, offer in one line to run the PR branch locally with seeded data so the user can try it, and to record a short walkthrough. When testing, exercise the main path and the suspected failure, and compare with the base branch. Say what you left running. When the user says the review is finished, remove the checkout, servers and throwaway data you created, and nothing else.

## Explain and draft

Open with the explanation, before the verdict: the problem the PR addresses, what changes for a user, and how the main changes produce that, in short sentences and everyday words. Define any term the diff introduces. Include a concrete example and material tradeoffs when they help. Keep it self-contained even if progress updates already covered it, and scale the detail to the change rather than giving only a verdict or a file list. Explain each finding the same way: what someone does, what happens, what should happen.

Keep one numbered list of draft comments for the whole review. For each: blocking or non-blocking, a precise file and line link, and the proposed comment. Add to the list when discussion raises a new concern, re-show it with posted or pending status whenever asked and in the final message, and keep the numbers stable so the user can say "post 1 and 3".

Comment style:

- Simple English, starting lowercase; preserve identifier casing. One ask per comment, one to three short sentences.
- Scenario first, then the fix as a question or a direct ask. Put the concrete trigger in backticks.
- Prefix non-blocking comments with `nit:`. Severity labels and verdict headings stay in the chat draft, not in posted text.
- Supporting analysis goes in the chat explanation, not in the comment. Attach a screenshot, a short recording or a measurement table when it shows the problem faster than words.
- Use the exact text the user supplies when asked to post it as-is.

When posting is authorized, post the selected findings as inline review comments on the exact file and line, not as one top-level comment. Post only verified locations, and recheck first whether later commits already addressed them.

End every review with one verdict line the user can answer in one word: `approve`, `approve with comments`, or `hold: <reason>`.

## Re-review

Read the commits since the reviewed SHA, check each earlier finding against them, and report fixed or still open before raising anything new.

## Finish accurately

Re-read the head SHA immediately before approval. If it changed, inspect the new diff and relevant checks before deciding. Pin the review to the reviewed commit, send an empty approval, and verify GitHub recorded it. Keep approval status separate from CI, base divergence, and merge readiness.

Finish with the PR explanation, the numbered draft list with its status, the verdict line, and the material evidence. Report verification limits honestly. State what was actually posted or approved; leave unposted drafts visibly in chat.
