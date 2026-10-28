# Instruction file templates

Fill only with facts from the code or the user. Anything unknown: `TODO(question): ...`.
Delete a section rather than leave filler. Keep the filled AGENTS.md under ~200 lines.

## Contents

- AGENTS.md (single repo, or the shared `project-context/` repo)
- AGENTS.md (app repo in a multi-repo setup)
- CLAUDE.md (next to every AGENTS.md)
- GEMINI.md (optional - only if the team wants a visible pointer)
- .gemini/settings.json (only for teams still on the legacy Gemini CLI)

## AGENTS.md (single repo, or the shared `project-context/` repo)

```markdown
# <Project name>

<One or two sentences: what the product does and who uses it.>

## Stack
- <Language + framework + version, from the manifest>
- <Database / queue / external services actually used in code>

## Commands
| Task | Command |
|---|---|
| Install | `<from manifest>` |
| Run locally | `<from manifest scripts>` |
| Test | `<from manifest scripts>` |
| Lint / typecheck | `<from manifest scripts, or delete row>` |

## Layout
- `<dir>/` - <what lives there, one line>

## Conventions (only what the code doesn't show)
- <Rule> - because <reason>.

## Domain docs (read the one for the area you touch)
- [<Area>](docs/domains/<area>.md)

## Team skills: load the matching skill BEFORE reading code or making changes

Required: without this table, agents skip the stack, testing and debugging skills on coding
tasks (measured in trigger testing). Keep only the stack skills this repo actually uses.

| When the task is... | Load this skill first |
|---|---|
| Any code change in this repo (feature, endpoint, page, refactor, bug fix) | `<node-express-standards / fastapi-standards / react-next-standards>` |
| Writing or changing tests, edge cases, checking before QA | `testing-qa` |
| A bug, error, failing or flaky test, unexpected behavior | `systematic-debugging` |
| About to say work is done, fixed or passing | `verification-before-completion` |
| Opening a PR or pushing a branch for review | `pr-ready` |
| Reviewing someone else's PR | `review-pr` |
| Deploy, release, staging, production, rollback, hotfix | `release-checklist` |
| Starting or continuing a card/ticket | `ai-dlc` and `nextsprint-workflow` |
| Docs, logging a decision (ADR in the repo, not agent memory), handoff notes, AI-readiness | `docs-keeper` |
| Improving or writing a prompt ("improve my prompt", "prompt behtar karo") | `prompt-engineering` |

Several can apply at once (e.g. a bug fix uses `systematic-debugging` + `testing-qa` + the stack skill).

## Unclear requests: check before changing code

Before editing any file, the request (plus the card, if there is one) must tell you three
things: **what** should change (behavior, not just an area), **where** (files, route, page),
and **how we'll know it works** (test, command, expected output).

- All three clear, or the code answers the gap in a quick look: just do the task. Don't ask
  for the sake of asking.
- Something only the developer can answer: don't edit yet. Reply with what you understood,
  what you found in the code, and at most 3 questions, each with a suggested default.
  "defaults" means go ahead with them.
- "Check this" / "dekh lo" with no symptom: a read-only look and a report is fine; no edits.

Example. Request: "add pagination". Reply:
> I found two list routes, `GET /orders` and `GET /products`; neither is paginated.
> 1. Which routes? - default: both
> 2. Style? - default: `?page` and `?size` (default 20, max 100), response `{ items, total, page, size }`
> 3. Done-check? - default: Supertest tests for first page, next page and size > 100; `npm test` passes
> Reply "defaults" or correct any of them.

Example. Request: "Add GET /health in src/app.ts returning 200 {status:'ok'} with a test" - clear, just do it.

## Decisions and handoffs
- Decisions: [docs/decisions/](docs/decisions/) - read before changing anything they cover.
- Last session: newest file in [sessions/](sessions/) (`YYYY-MM-DD-topic.md`).

## Rules from review (feedback loop)
- <Do X / never Y> - because <reason> (review YYYY-MM-DD).
```

## AGENTS.md (app repo in a multi-repo setup)

```markdown
# <App name> (<backend | frontend | admin>)

Part of <Project>. Shared context lives in the `project-context` repo, checked out at
`../project-context/`. Read `../project-context/AGENTS.md` first, then the domain doc for your area.

## Commands
| Task | Command |
|---|---|
| Run | `<...>` |
| Test | `<...>` |

## This repo only
- <App-specific conventions, env setup, layout>

## Shared docs
- Architecture: `../project-context/docs/architecture.md`
- Glossary: `../project-context/docs/glossary.md`
- Domains: `../project-context/docs/domains/`
- API contract: `../project-context/docs/api-contracts/openapi.yaml`
- Decisions: `../project-context/docs/decisions/`
- Handoffs: `../project-context/sessions/`
```

## CLAUDE.md (next to every AGENTS.md)

```markdown
@AGENTS.md

<!-- Claude-only additions below this line, if any. Shared rules go in AGENTS.md. -->
```

## GEMINI.md (optional - only if the team wants a visible pointer)

Antigravity already loads AGENTS.md and adds GEMINI.md on top, so do NOT copy or include
AGENTS.md here (it would load twice).

```markdown
Project instructions live in AGENTS.md (loaded automatically). Gemini-only additions below, if any.
```

## .gemini/settings.json (only for teams still on the legacy Gemini CLI)

```json
{ "context": { "fileName": ["AGENTS.md", "GEMINI.md"] } }
```
