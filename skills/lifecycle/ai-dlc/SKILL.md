---
name: ai-dlc
description: Use when starting or continuing any development task - start card X, work on this ticket, pick up this card, pick my next task, implement feature Y, fix this bug, start working on this issue, where are we on this task. Entry point for the team lifecycle: sizes the work so small tasks stay light, sets the gates a card must pass, and says which team skill to use when. Keywords - AI-DLC, lifecycle, Definition of Ready, Definition of Done, spec, acceptance criteria, product thinker, NextSprint card, multi-repo, handoff. Not for answering a quick code question, reviewing someone else's PR (use review-pr) or only moving a card on the board (use nextsprint-workflow).
metadata:
  author: NextPak AI Team
  version: 0.1.2
---

# AI-DLC: the team development lifecycle

This skill is the **map**, not the manual. It tells you which phase you are in, which gate
must pass before the next one, and which skill does the real work. Don't repeat other skills'
rules here; open them.

## CRITICAL rules

- **No code before the gate says so.** Card not Ready = ask, don't build. Large task = the
  developer approves the spec in writing before the first line of code.
- **Scale the process to the size** (section 2). Small tasks stay small: no spec file, no
  ceremony. Risky areas are always Large, however few lines they touch.
- **Never guess requirements.** Unknowns become `[NEEDS CLARIFICATION: <exact question>]` in the
  spec and are asked before building. Assumptions you do make are written down and shown.
- **Evidence before claims** at every gate: paste command output (`verification-before-completion`).
- **One card = one branch = one purpose per repo.** Something else you notice goes to
  "Follow-ups", not into this branch.
- **Keep the phase checklist (section 8) current** and print it at every gate change.
- The board is the source of truth for status. Card moves, comments and checklists go through
  `nextsprint-workflow`. Never move a card to Done yourself unless the team's flow says so.

## 0. Session start and entry gate

1. **Continuity:** read the newest handoff (`ls sessions/ | tail -1`, here or in
   `../project-context/sessions/`) and the card's comments since then. Resuming? Rebuild the phase
   checklist from them and continue where it stopped.
2. **AI-ready?** AGENTS.md exists and links the domain docs for this area, decisions and sessions
   folders exist, the test command runs. Any "no" = run `docs-keeper` section A first and report.
   Small task: only check AGENTS.md exists and the test command runs.

## 1. Intake

1. **Get the work.** Card id/title given, or "pick my next task" = use `nextsprint-workflow` to
   fetch it (description, checklists, comments, attachments, links). No card = take the developer's
   message as the card and suggest creating one for anything beyond Small.
2. **Classify** (pick one; say it in the checklist):

   | Type | Signs | Path |
   |---|---|---|
   | feature | new or changed user-visible behavior | Plan -> Build -> ... (sections 3, 5) |
   | bug | "broken", "error", "not working", a regression | Bug path (section 4) |
   | chore | refactor, config, dependency bump, docs, CI | no behavior change: existing tests green before and after |
   | spike | "find out", "is it possible", "compare" | time-box (ask how long), no production code, result = findings comment + recommendation |

3. **Definition of Ready** - all must be true before Plan finishes:
   - [ ] Clear goal: who needs what, and why
   - [ ] Acceptance criteria exist or can be written and agreed now
   - [ ] Designs (UI work) and API contract (cross-repo work) attached or linked
   - [ ] No open blockers or unanswered questions on the card; dependencies done
   - [ ] Fits one card (if not, propose a split into smaller cards)

   Not ready = list the exact gaps, comment them on the card (`nextsprint-workflow`), ask the
   developer, and stop. Don't fill gaps with guesses.
4. Card is ready: move it to the in-progress list (`nextsprint-workflow`).

## 2. Size the work and scale the process

Any Large trigger wins. Unsure = go one size up. Full detail: [references/sizing.md](references/sizing.md).

- **Small:** about 1 hour or less, one file area, no risky trigger. (Copy fix, small UI tweak, one validation rule.)
- **Normal:** a few hours to ~2 days, one repo, no risky trigger.
- **Large / risky:** auth, sessions, payments, roles/permissions, deleting data, DB migrations
  on existing data, public API contract change, multi-repo, or more than ~2 days.

| Gate | Small | Normal | Large / risky |
|---|---|---|---|
| 0 Readiness | quick check | full if anything missing | full |
| Spec | 2-5 acceptance criteria in a card comment | short spec in card description or comment | spec file ([template](references/spec-template.md)) |
| Product-thinker pass | skip (one-line risk check) | top questions that apply | full [question bank](references/product-thinker-questions.md) |
| Approval before code | none (AC visible on card) | developer OKs the AC | developer approves spec + plan in writing |
| Tests first (`testing-qa`) | yes | yes | yes, incl. its Level 3 edge cases |
| Decision record (`docs-keeper`) | rarely | if a real choice was made | required for each hard-to-reverse choice |
| PR (`pr-ready`) + review (`review-pr`) | yes | yes | yes; flag risky files for the reviewer |
| Release (`release-checklist`) | normal deploy | normal deploy | full checklist, rollback plan, staging smoke |
| Close-out (`docs-keeper`) | handoff only if session ends | section B | section B + feedback loop |

## 3. Plan

1. **Read** the domain docs for every area the card touches (linked from AGENTS.md).
2. **Write the spec** at the size's depth from [references/spec-template.md](references/spec-template.md):
   goal, user-visible behavior, acceptance criteria as testable statements, out of scope, affected
   domain docs, skills/MCPs needed, risks.
3. **Product-thinker pass:** walk [references/product-thinker-questions.md](references/product-thinker-questions.md).
   Each question that applies becomes an acceptance criterion, an out-of-scope line, or a
   `[NEEDS CLARIFICATION]`. Report gaps and risks to the developer before building.
4. **Skills and MCPs:** list what the task needs (stack skill, Playwright, Stripe, Sentry, DB...).
   Missing one? Tell the developer what and why, and install it only after they agree.
5. **Store the spec:**
   - Small / Normal: on the card (description or a comment, via `nextsprint-workflow`).
   - Large: `docs/specs/YYYY-MM-DD-<card-id>-<slug>.md` in the repo; multi-repo:
     `project-context/docs/specs/`. Link it from the card. Follow the project's existing spec
     location if AGENTS.md names one.
6. **Gate:** no `[NEEDS CLARIFICATION]` left; approval as the size table says. Large: also a
   short plan (ordered steps, repos, migrations, flags) approved with the spec.

## 4. Bug path

1. **Reproduce** with exact steps, input and environment. Can't reproduce = gather more data
   (logs, Sentry, request id) and ask; don't fix blind.
2. **Failing test first** that shows the bug (`testing-qa`, bug fixes section). Paste the RED output.
3. **Root cause** before any fix (`systematic-debugging`). Write the cause in one sentence.
4. **Fix** the cause, not the symptom, in the smallest change (stack skill rules apply).
5. **Verify:** the new test is GREEN, the full suite is green, the original repro steps now
   work (`verification-before-completion`). Record expected vs unchanged behavior in the PR.
6. Same bug class seen before? Note it for the close-out feedback loop.

## 5. Build -> Verify -> Integrate -> PR -> Deploy -> Close-out

| Phase | Do | Skill | Gate to pass |
|---|---|---|---|
| 2 Build | branch from latest target; tests first from the AC; small commits; product-thinker stays on; big decisions logged immediately | stack skill(s) below, `testing-qa`, `docs-keeper` (ADR) | every AC has a test that went RED then GREEN |
| 3 Verify | full suite + lint + types + build; risk-level browser checks; save evidence | `testing-qa` (levels 0-3), `verification-before-completion` | all green with pasted output; evidence saved |
| 4 Integrate | sync with target branch, resolve conflicts, rerun full suite | `pr-ready` (section 1) | green after sync |
| 5 PR | scope check, secrets/debug check, fresh-context self-review, PR description linking the card | `pr-ready`; reviewer uses `review-pr` | PR open, card moved to review (`nextsprint-workflow`) |
| 6 Deploy | CI green, pre-deploy checks, staging and prod smoke, watch errors; problem = roll back first | `release-checklist` | smoke tests pass; nothing new in error tracking |
| 7 Close-out | update domain docs, ADRs, AGENTS.md links, handoff; repeat mistakes become checks | `docs-keeper` (B, C) | docs match code; handoff written; card updated |

**Pick the stack skill** from the repo, not from memory (several for full-stack work):
- `package.json` with `express` -> `node-express-standards`
- `package.json` with `next`, `react` or `vite` -> `react-next-standards`
- `pyproject.toml` / `requirements.txt` with `fastapi` -> `fastapi-standards`
- None match: follow the repo's existing patterns and tell the developer no team skill covers it.

Review feedback on your PR: fix each point, rerun Verify, reply per comment. Don't argue
without evidence; don't accept a change you can't verify.

## 6. Multi-repo tickets (backend + frontend + admin + project-context)

1. **Contract first.** Change `project-context/docs/api-contracts/openapi.yaml` in its own PR,
   reviewed and agreed before app code. Prefer additive changes; a breaking change needs a
   version or a migration window (Large, ADR required).
2. **Backend before frontend.** Backend implements the contract with contract/API tests and
   deploys first, staying backward compatible with the current frontend. Frontend and admin may
   build in parallel against a mock of the agreed contract, but merge after the backend.
3. **One PR per repo**, each linking the same card and the sibling PRs. One branch name across repos.
4. Card checklist gets one item per repo (`nextsprint-workflow`). The card is done only when every repo is.
5. Docs: shared facts in project-context, app-only facts in the app repo (`docs-keeper`).

## 7. Session end

Stopping mid-task or done for the day: write the handoff (`docs-keeper` B6), post a short status
comment on the card (`nextsprint-workflow`), and print the phase checklist. Next session starts at section 0.

## 8. Phase checklist (print and keep current)

Print this at intake and at every gate change. Keep it short; one line per phase.

```
AI-DLC | card NS-123 "CSV export for orders" | feature | Normal | repos: backend
[x] 0 Ready      AGENTS.md ok; `npm test` 84 passed
[x] 1 Plan       5 AC agreed on card (2026-10-27); no open questions
[>] 2 Build      branch feat/ns-123-csv-export; AC 3/5 RED->GREEN
[ ] 3 Verify     testing-qa level 1
[ ] 4 Integrate
[ ] 5 PR
[ ] 6 Deploy
[ ] 7 Close-out
Waiting on: - | Follow-ups: pagination bug in /orders (new card?)
```
Marks: `[x]` done, `[>]` current, `[ ]` to do, `[-]` skipped by size (say why), `[!]` blocked.

## Definition of done (check before saying "done")

- [ ] Card was Ready; type and size stated; spec stored where section 3 says
- [ ] Every acceptance criterion has a test that went RED then GREEN (output pasted)
- [ ] Full suite, lint, types, build green after syncing with target (output pasted)
- [ ] Browser checks match the `testing-qa` risk level, evidence in the PR
- [ ] PR passed `pr-ready`, links the card (and sibling PRs for multi-repo)
- [ ] Deployed per `release-checklist`, smoke tests passed (when the team deploys per card)
- [ ] `docs-keeper` close-out done; handoff written; card updated via `nextsprint-workflow`
- [ ] Phase checklist printed with every line `[x]` or `[-]` with a reason

## Red flags: stop and fix

- Writing code while the card has open questions or no acceptance criteria
- A Large/risky task (auth, payments, permissions, deletes, migrations) treated as Small
- A spec file and approval round for a one-line copy fix (process too heavy; scale down)
- Bug "fixed" without a failing test first, or without a stated root cause
- Frontend merged before the backend contract is agreed and deployed
- One PR changing several repos' concerns, or one branch doing two cards
- "Done" with no command output, no card update, or no handoff at session end
- Skills or MCPs installed without asking the developer

## References

[Spec template](references/spec-template.md) (feature, bug, spike forms),
[product-thinker question bank](references/product-thinker-questions.md),
[sizing detail](references/sizing.md).
