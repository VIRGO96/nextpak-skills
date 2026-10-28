# NextPak AI Skills

Shared agent skills for the NextPak team. Each folder is one skill (`SKILL.md` + optional
`references/` and `scripts/`). They work in Claude Code and Google Antigravity (same open
Agent Skills format). Skills load automatically when a prompt matches their description.

## Start here

`ai-dlc` is the entry point for any ticket. It sizes the work (Small / Normal / Large), runs the
lifecycle gates, and hands off to the other skills at the right step.

```
card/ticket -> ai-dlc -> nextsprint-workflow (board) -> stack skill + testing-qa (build)
            -> verification-before-completion -> pr-ready -> review-pr (reviewer)
            -> release-checklist (deploy) -> docs-keeper (close-out)
bug         -> testing-qa (failing test) -> systematic-debugging (root cause) -> fix
```

## Skills

| Skill | Phase | Use it for | Example prompts that load it |
|---|---|---|---|
| `ai-dlc` | 0-7 | Working any card from start to close-out | "start card SHOP-42", "start working on this bug", "pick my next task" |
| `nextsprint-workflow` | all | Keeping the NextSprint card updated (move, checklist, comments, PR link) | "move my card to doing", "I'm blocked, update the card" |
| `node-express-standards` | 2 | Any Node.js + Express backend change | "add an API to cancel orders", "create the users endpoint" |
| `fastapi-standards` | 2 | Any Python FastAPI backend change | "add an endpoint to archive a note", "add pagination" |
| `react-next-standards` | 2 | React / Next.js / Vite frontend work | "build a settings page", "add validation to this form" |
| `testing-qa` | 2-3 | Tests first, edge cases, risk-based Playwright checks | "write tests for this endpoint", "test the edge cases before QA" |
| `verification-before-completion` | 3 | Evidence before saying "done" | "is the fix done? confirm everything passes" |
| `systematic-debugging` | bugs | Root cause first, then fix | "these tests fail randomly", "this returns 500, fix it" |
| `pr-ready` | 4-5 | Everything before opening a PR (+ `scripts/check-diff.mjs`) | "open a PR", "push my branch" |
| `review-pr` | 5 | Reviewing a teammate's PR against team standards | "review PR 42", "check my teammate's PR for bugs" |
| `release-checklist` | 6 | Staging/production deploy, smoke test, rollback | "deploy to staging", "is it safe to push to production?" |
| `docs-keeper` | 0, 7 | AI-readiness check, docs/decisions/handoff | "is this project AI-ready?", "write a handoff note", "log this decision" |

`systematic-debugging` and `verification-before-completion` are copied unmodified from
[obra/superpowers](https://github.com/obra/superpowers) (MIT), see `third-party/superpowers/SOURCE.md`.

## Install in a project

Copy the skill folders into the project (flatten `third-party/superpowers/*` into the same folder):

- Claude Code: `.claude/skills/<skill-name>/`
- Antigravity: `.agents/skills/<skill-name>/`

Then add the "Team skills" table to the project's `AGENTS.md` (template in
`docs-keeper/references/agents-md-template.md`). This step is required: in trigger testing,
agents skipped the stack, testing, debugging and release skills on coding prompts until the
table was present (12/29 prompts loaded the right skill without it). Recommended extra for
frontend: Vercel's `vercel-react-best-practices` skill (MIT), see `react-next-standards`.

## Changing a skill

Skills are tested like code: reproduce the mistake an agent makes without the rule, change the
skill, check the mistake is gone. Bump `metadata.version` on every change.
