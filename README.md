# skills

Agent skills I use day to day. They are plain [Agent Skills](https://agentskills.io) (`SKILL.md` folders), so they work in Claude Code, Codex and any other agent that reads skills.

| Skill | What it does | Assumes |
|---|---|---|
| [sonicboom](skills/sonicboom/SKILL.md) | Ships one PR end to end: scopes the ticket or request, builds in its own git worktree, verifies, records screenshots and a video, opens the PR, works CI and review findings, merges under the policy you set, closes the ticket and cleans up. Can also pick up part-way, from local changes or an open PR. | git worktrees, `gh`. Optional: a ticket tracker, a review bot. Playwright and ffmpeg for the media. |
| [babysit](skills/babysit/SKILL.md) | Watches one or more open PRs until they merge: reruns flaky checks, fixes real failures, resolves conflicts with the base, works review comments with commits and resolves the threads, and can run an independent review. It proposes the merge unless you told it to merge when green. | git, `gh`. Optional: Codex CLI or `claude -p` for review mode. |
| [pr-pal](skills/pr-pal/SKILL.md) | Reviews other people's PRs. Explains the change in plain words, asks whether it is needed and what it costs, keeps only realistic findings, shows numbered draft comments in chat before posting anything, and approves with an empty body when you say so. Handles a whole queue by author. | `gh`. |
| [kirei](skills/kirei/SKILL.md) | Audits a web app's UI for layout breakage and visual noise at phone and desktop widths, then ships the fixes as small PRs with before and after screenshots. Covers breakage, spacing and alignment, layout shift, needless copy and inconsistent patterns. Includes a Playwright crawler that measures overflow, clipping and overlap. | A locally runnable web app with Playwright installed, `gh`. |

These skills are opinionated and they act. sonicboom and babysit push commits and resolve review threads. sonicboom merges its PR once it is approved and green unless you set another policy; babysit merges only when told to. Read a skill before you let it run in a repo you care about.

## Install

### Any agent, with the skills CLI

```bash
npx skills add Parassharmaa/skills
```

The CLI asks which skills and which agents to install to. Useful flags:

```bash
npx skills add Parassharmaa/skills --list                      # see what is in the repo
npx skills add Parassharmaa/skills --skill kirei -a claude-code # one skill, one agent
npx skills add Parassharmaa/skills -g                           # all projects, not just this one
```

### Claude Code, as a plugin

Inside Claude Code:

```
/plugin marketplace add Parassharmaa/skills
/plugin install pr-workflow@parassharmaa-skills
```

Or from a shell:

```bash
claude plugin marketplace add Parassharmaa/skills
claude plugin install pr-workflow@parassharmaa-skills
```

The plugin is called `pr-workflow` and carries the skills listed above.

### Codex, as a plugin

```bash
codex plugin marketplace add Parassharmaa/skills
codex plugin add pr-workflow@parassharmaa-skills
```

### By hand

```bash
git clone https://github.com/Parassharmaa/skills
cp -r skills/skills/kirei ~/.claude/skills/     # Claude Code
cp -r skills/skills/kirei ~/.agents/skills/     # Codex and other agents
```

## Use

Each skill also triggers on its own when a request matches its description, so "keep monitoring this PR and merge when green" is enough. To call one by name:

| Skill | Claude Code (skills CLI or by hand) | Claude Code (plugin) | Codex (skills CLI or by hand) |
|---|---|---|---|
| sonicboom | `/sonicboom PROJ-123` | `/pr-workflow:sonicboom PROJ-123` | `$sonicboom PROJ-123` |
| babysit | `/babysit 482, merge when green` | `/pr-workflow:babysit 482, merge when green` | `$babysit 482, merge when green` |
| pr-pal | `/pr-pal <PR URL>, approve if all good` | `/pr-workflow:pr-pal <PR URL>` | `$pr-pal <PR URL>` |
| kirei | `/kirei settings page` | `/pr-workflow:kirei settings page` | `$kirei settings page` |

With the Codex plugin, pick the skill from the `$` menu.

## Layout

```
skills/<name>/SKILL.md            the skills (one folder each, scripts beside them)
.claude-plugin/marketplace.json   Claude Code marketplace
.agents/plugins/marketplace.json  Codex marketplace
.codex-plugin/plugin.json         Codex plugin manifest
```

One `skills/` folder serves every install path, so there is a single copy of each skill.

## License

[MIT](LICENSE)
