---
name: docs-keeper
description: Use when checking whether a project is AI-ready before starting a feature (is this project AI-ready, set up AGENTS.md, CLAUDE.md or GEMINI.md, add domain docs, check the project docs), or when closing out a task (update the docs, end of task, close out, log this decision, record why we chose X, write an ADR (decisions are saved as ADR files in the repo, never only in personal or agent memory), write a handoff note for the next session, wrap up the session), or when a reviewer or QA reports a mistake that keeps coming back and it should become a rule or a check (make sure this mistake does not happen again). Works for a single repo or a shared project-context repo with separate app repos. Not for writing user-facing product docs, API reference sites or README marketing copy.
metadata:
  author: NextPak AI Team
  version: 0.5.0
---

# Docs Keeper

Keep a project "AI-ready": every new session starts with the right context, and agents stop
repeating the same mistakes. Three moments: **A. Readiness check** (Phase 0, before a feature),
**B. Close-out** (Phase 7, after a task), **C. Feedback loop** (when review/QA finds a repeat mistake).
The lifecycle orchestrator is the `ai-dlc` skill; PR steps are in `pr-ready`.

## CRITICAL: facts only, and only what changed

- **Never invent.** Every line you write comes from the code, a command you ran, or the user.
  Anything else is `TODO(question): <exact question>` and goes into your summary for the user.
- **Scope = the change.** Update only docs for areas the task touched. Don't rewrite, reformat or
  "improve" unrelated docs. Something else looks stale? List it under "Follow-ups"; don't fix it.
- **One fact, one place.** Link to the file that owns a fact instead of copying it.
  AGENTS.md links to domain docs; domain docs link to code and ADRs.
- **Don't move or rename existing docs** to fit this layout. Add the missing pieces next to them
  and link from AGENTS.md.

## Layout

Single repo:
```
AGENTS.md            # single source of instructions (<~200 lines)
CLAUDE.md            # contains "@AGENTS.md" (+ Claude-only lines, if any)
GEMINI.md            # optional pointer only - see "Sharing one file"
docs/domains/<area>.md
docs/decisions/NNNN-title.md
sessions/YYYY-MM-DD-topic.md
```

Multi-repo: a `project-context/` repo holds AGENTS.md + CLAUDE.md, `docs/architecture.md`,
`docs/glossary.md`, `docs/domains/`, `docs/api-contracts/openapi.yaml`, `docs/decisions/`,
`workflow/`, `sessions/`. Each app repo (backend, frontend, admin) has its own **short** AGENTS.md
(its commands + app-only rules + links to `../project-context/...`) and a CLAUDE.md with `@AGENTS.md`.
Shared facts live only in project-context; app-only facts live only in the app repo.

## Sharing one file across tools (checked 2026-10)

| Tool | What it reads | Do this |
|---|---|---|
| Claude Code | `CLAUDE.md`; reads `AGENTS.md` itself only if no `CLAUDE.md`/`CLAUDE.local.md` is in or above the folder (v2.1.277+). Never reads `.agents/` | CLAUDE.md = `@AGENTS.md` on the first line. Works on every version, Claude skips the duplicate. Use the import, not a symlink (symlinks break on Windows clones). |
| Antigravity (IDE, App, CLI) | `AGENTS.md` **and** `GEMINI.md` and `.agents/rules/*.md`, combined (cumulative) | Nothing needed. If GEMINI.md exists, never paste or include AGENTS.md into it (it would load twice). |
| Legacy Gemini CLI | `GEMINI.md` by default | `.gemini/settings.json`: `{"context":{"fileName":["AGENTS.md","GEMINI.md"]}}`. Unverified whether Antigravity CLI honours this key; it doesn't need it. |

Skills: `.claude/skills/<name>/` (Claude Code), `.agents/skills/<name>/` (Antigravity workspace).
Cross-repo: Claude asks once to approve `@` imports outside the working directory, and it's
unverified how Antigravity includes files outside the workspace. So in app repos, **link**
shared docs by path; don't import them.
Sources: https://agents.md , https://code.claude.com/docs/en/memory ,
https://antigravity.google/docs/rules/ , https://antigravity.google/docs/skills ,
https://geminicli.com/docs/cli/gemini-md/ . Tool behaviour changes often; re-check if something looks off.

## A. Readiness check (Phase 0)

1. **Find the layout.** Look for `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` here and in a sibling
   `../project-context/`. No `project-context` and no link to one = single repo. Existing files
   link to a shared repo you can't see, or the user mentions other app repos = ask.
2. **Gather facts** (read, don't guess): manifest (`package.json`, `pyproject.toml`, `go.mod`...)
   for stack and scripts; README; CI config; top-level folders; the existing docs.
3. **Find the major areas.** An area is a business capability, not a technical layer: one feature
   folder/module, or a group of routes + models + services for the same thing (auth, billing,
   orders). Infrastructure folders (`lib`, `utils`, `config`, `middleware`) are not areas.
   Fewer than 3 obvious areas? One doc per area found is fine. Not sure? Ask.
   Code that exists but isn't wired up (imported but never called, routes promised in a comment)
   goes under "Known issues", never under "How it works".
4. **Run the tests** with the command from the manifest. Record the exact command and the
   summary line. No test script, or it fails? Don't fix code in Phase 0: write the command into
   AGENTS.md as it is, note that it fails and why (plus any command you saw pass), and add a
   `TODO(question)` asking whether to fix it.
5. **Score each item** and print this table:

   | Item | Pass when |
   |---|---|
   | AGENTS.md | exists, under ~200 lines (`wc -l`), has run/test commands that actually work |
   | Skill map | AGENTS.md has the "Team skills" table from the template, with this repo's stack skill (without it agents skip stack/testing/debugging skills), the "Unclear requests" section (without it agents guess on vague prompts and edit code), and the "Production and data safety" section |
   | CLAUDE.md | exists and imports `@AGENTS.md` |
   | GEMINI.md | absent, or a pointer with no copied AGENTS.md content |
   | Domain docs | one per major area in `docs/domains/`, each listing its code paths |
   | Decisions | `docs/decisions/` exists (empty is fine) |
   | Sessions | `sessions/` exists (empty is fine) |
   | Tests | the test command runs and the result is recorded |

6. **Create what's missing** from [references/](references/) templates, filled only with facts
   from steps 2-4. A template section the code can't answer: `TODO(question)` if it matters for
   the area, otherwise delete it. Empty `docs/decisions/` and `sessions/` get a `.gitkeep` (not a
   README: it would break "highest number" and "newest file" lookups); AGENTS.md already states
   their naming rules. An existing CLAUDE.md or GEMINI.md full of rules: move the shared rules
   into AGENTS.md, leave only the import or pointer, and show the user the diff.
7. **Check links** in every file you created (same as B7).
8. **Report**: the table with pass/created/fail per item, every `TODO(question)`, and the
   test result. Ask the user the TODO questions before the feature starts.

## B. Close-out (Phase 7)

**When:** on the feature branch, after the code is final and before `pr-ready`'s last check, so the
docs ship in the same PR and the reviewer sees them. Something changes after merge or deploy
(hotfix, rollback)? Add it to the handoff note in a small follow-up commit.

1. **List what changed**: `git diff --name-only <base>...HEAD` plus `git status --short`.
2. **Map files to docs**: a changed file belongs to a domain doc when it matches a path in that
   doc's "Code" section. A file that matches no doc:
   - part of a business area that has no doc yet: create one from the template;
   - entry point, config, shared `lib/` or tooling: no domain doc; check the AGENTS.md
     Layout/Commands lines instead.
   A changed API contract: update `openapi.yaml` (multi-repo) or the doc's API section.
3. **Update each mapped doc**: edit only the sections the change made wrong or incomplete.
   Re-read the code you describe; don't describe code from memory. Check "Known issues" too: remove
   items the change resolved, add ones it created. Set "Last updated" to today plus the short hash
   of the latest code commit you checked (`git log -1 --format=%h -- <code paths>`).
4. **Decisions.** ADR ([template](references/adr-template.md)) only if **both**: (a) there were two or
   more real options, and (b) the choice is costly to undo, binds other modules or repos, or a future
   dev would likely "fix" it back by mistake. Typical: new library or service, data model or API
   contract shape, auth/security approach, a pattern others must follow. Not: bug fixes, adding a
   field, routine code. Already written during BUILD? Check it still matches the code. Next number =
   highest existing + 1; delete `.gitkeep` once the folder has a file. Reversing an old decision =
   new ADR + mark the old one `superseded by ADR-NNNN`. Link the ADR from the domain doc's "Related".
5. **AGENTS.md**: add a link or line for every new domain doc, command, env setup step or skill.
   Re-check every command, number or claim AGENTS.md states about the touched area ("N tests pass"
   goes stale; prefer no counts). Still under ~200 lines? If not, move detail into a domain doc.
6. **Handoff note** in `sessions/` ([template](references/handoff-template.md)): done, pending,
   known issues, next steps, docs touched, test output. Card link from the board (skill:
   `nextsprint-workflow`); unknown = `TODO(question)`.
7. **Check links** in every file you touched: each relative `](link)` resolves from the doc's own
   folder; each backticked **file path** resolves from the repo root. Check with `ls`/`Test-Path`.
   Skip URLs, branch names, routes (`POST /api/...`), placeholders like `<feature>` and globs like `**`.
8. **Commit** the doc changes as their own `docs(scope): ...` commit on the same branch.

Multi-repo: commit doc changes in `project-context` as their own commit/PR, and reference it in
the app PR. App-only commands stay in the app repo's AGENTS.md.

## C. Feedback loop (recurring mistakes)

A mistake is "recurring" when it happened twice, or once and it was expensive (data leak, broken
release). Pick the **strongest** fix that works and say which one you picked and why:

1. **Automated check** (best): a test, lint rule, type, CI step or hook that fails when the mistake
   happens. Use this whenever the mistake can be detected mechanically.
2. **Domain doc rule**: when it's specific to one area ("refunds must go through `RefundService`").
3. **AGENTS.md rule**: only when it applies everywhere and can't be automated.

Rule format: `<Do X / never Y> - because <reason> (review YYYY-MM-DD)`. One line. If an existing
rule already covers it, make that rule clearer instead of adding a second one.

Doing the fix:
- **Automated check:** prove it works: it must fail on the current mistake (or a reproduction)
  and pass after the fix; paste both outputs. Put it in its own commit (`test:`/`ci:`/`build:`).
  Add its command to AGENTS.md "Commands" with a short "why" instead of a prose rule. Too big for
  this branch (e.g. it fails across the codebase)? Write the rule now and open a follow-up card.
- A new test, lint rule or CI step is a code change: it goes through `pr-ready` like any other.
- Say in the handoff which fix you picked (check / domain rule / AGENTS.md rule) and why.

## Definition of done (check before saying "done")

- [ ] Every new line traces to code, a command output, or the user; unknowns are `TODO(question)`
- [ ] Only docs for the changed areas were edited; no unrelated rewrites, moves or renames
- [ ] AGENTS.md is the single source, under ~200 lines; CLAUDE.md = `@AGENTS.md`; GEMINI.md holds no copy
- [ ] Every domain doc touched matches the current code and lists its code paths
- [ ] Significant decisions have a numbered ADR; superseded ones are marked
- [ ] New docs, commands and skills are linked from AGENTS.md
- [ ] Handoff note written in `sessions/YYYY-MM-DD-topic.md` with real test output
- [ ] Doc changes committed on the feature branch (same PR as the code)
- [ ] All relative links and code paths in touched files exist
- [ ] Recurring mistakes became a check or a rule, and the summary says which

## Red flags: stop and fix

- A doc describes a function, endpoint, file or command that doesn't exist
- Business rules, versions or numbers nobody stated and the code doesn't show (invented facts)
- AGENTS.md growing past ~200 lines, or pasting code and long explanations into it
- The same content in AGENTS.md and CLAUDE.md/GEMINI.md, or in two domain docs
- A domain doc with no "Code" paths (can't be mapped at close-out, so it will rot)
- Editing an accepted ADR's decision instead of superseding it
- "Docs updated" or "tests pass" with no file list or command output
- A rule added to AGENTS.md for something a lint rule or test could catch
- A new automated check with no "failed before, passes after" output
- Close-out done after the PR was approved, so the reviewer never saw the doc changes

## Templates

[AGENTS.md / CLAUDE.md / GEMINI.md](references/agents-md-template.md),
[domain doc](references/domain-doc-template.md), [ADR](references/adr-template.md),
[handoff](references/handoff-template.md).
