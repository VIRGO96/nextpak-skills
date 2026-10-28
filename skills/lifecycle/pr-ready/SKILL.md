---
name: pr-ready
description: Use when a change is finished and about to go up for review - the user says open a PR, create a pull request, draft PR, ready for review, push my branch, send it for review, raise a merge request, is this ready to merge. Covers syncing with the target branch, scope check of the full diff, secrets and debug-code check script, fresh-context self-review, Conventional Commits, PR size and splitting, PR description, draft PRs, required CI checks and linking the PR to the board card. Works for any stack. Not for reviewing someone else's PR - use the review-pr skill for that.
metadata:
  author: NextPak AI Team
  version: 0.2.0
---

# PR Ready

Run every step below before you open a pull request. Goal: the PR passes review and QA
the first time, and merging it is safe. This is phases 4-5 of the lifecycle (skill: `ai-dlc`);
deploy steps after merge live in `release-checklist`.

## CRITICAL rules

- **Evidence before claims.** Never write "tests pass", "lint clean" or "ready" without running the
  command in this session and pasting its output. Run it, read the exit code, then claim.
- **Every changed file must belong to the ticket.** Revert anything else, even if it looks like an improvement.
- **Never change an existing API response shape, status code, or public function signature** unless the
  ticket asks for it. Never delete or move a file outside the ticket's scope.
- **Never commit secrets or `.env` files.** If a real secret was ever committed, tell the user: it must be
  rotated. Deleting it in a later commit does not remove it from git history.
- **Never resolve a conflict by blindly taking one side.**
- **Never `git push --force`.** After a rebase use `git push --force-with-lease`.

## 1. Sync with the target branch

1. Find the target branch (usually `develop` or `main`; check the ticket or the repo's `AGENTS.md`/`CLAUDE.md`).
2. Commit or stash your work, then:
   ```bash
   git fetch origin
   git rebase origin/develop        # or origin/main
   ```
   If other people also push to this branch, use `git merge origin/develop` instead of rebase.
3. Resolve conflicts carefully, one file at a time:
   - Read **both** sides and find out why the target changed: `git log -p origin/develop -- path/to/file`.
   - Keep both intents. The result must contain the target's change **and** yours.
   - During a rebase, "ours" is the target branch and "theirs" is your commit (the reverse of a merge).
     Don't run `git checkout --ours/--theirs` on a whole file unless you have checked every hunk.
   - Ask the user when the two sides conflict in behaviour (not just text).
4. On the synced result, rerun the **full** suite, not just the tests you touched:
   test, lint, typecheck, build (use the project's own scripts, e.g. `npm test`, `npm run lint`,
   `npx tsc --noEmit`, `npm run build`, or `pytest`, `ruff check`, `mypy`). All must pass.
   A rebase can break code that passed before, so results from before the rebase don't count.

## 2. Scope check: read the full diff

```bash
git diff --stat origin/develop...HEAD
git diff origin/develop...HEAD
```

Read every file in the diff, not just the summary. For each file ask "does the ticket need this?"
AI agents often make these unrequested changes. Revert them:

- Reformatting a whole file, reordering imports, renaming nearby variables
- "Improving" code next to the change, or refactors nobody asked for
- Changing an existing endpoint's response, error body or status code
- Deleting, moving or renaming files outside the ticket
- Updating dependencies or lock files the ticket didn't need
- Edits to config, CI or generated files (`dist/`, `build/`, `*.min.js`, snapshots, generated clients).
  If generated output must change, regenerate it with the project's command; never hand-edit it.
- Whole files changed by line endings (CRLF/LF) or a formatter: restore them (see step 3 warnings)

Revert a whole file: `git checkout origin/develop -- path/to/file`. Revert part of a file: edit it by hand.
Useful cleanups you found go under "Out of scope / follow-ups" in the PR, not into this PR.

## 3. Secrets and debug check

Run the helper script from the repo root. It checks the branch diff against the target branch:

```bash
node <this-skill-folder>/scripts/check-diff.mjs --base develop
node <this-skill-folder>/scripts/check-diff.mjs --staged     # only staged changes
```

It flags (exit code 1 = errors): secret patterns (AWS, GitHub, Slack, Stripe, Google, OpenAI,
Anthropic keys, private keys, JWTs, passwords in URLs, hardcoded `apiKey = "..."`), committed `.env`
and key files, `console.log` / `debugger` / `print()` / `pdb`, temp and backup files (`.orig`, `.bak`,
`.log`). It warns on: TODOs without a ticket id, commented-out code, files that changed mostly by
line endings or whitespace, and diffs over 400 changed lines. It lists (INFO) deleted, renamed and
binary files, and generated/vendored paths (`dist/`, `build/`, `*.min.js`, snapshots), which are
scanned for secrets only and not counted in the size. To allow one reviewed line, add a
`pr-ready-ignore` comment on it. Exit 2 = it could not run (e.g. base branch not fetched).

The script is a fast first pass, not a full scanner. Also check by eye:

- No commented-out code blocks; delete them (git history keeps the old version)
- Every `TODO`/`FIXME` has a ticket id, e.g. `// TODO(PROJ-123): ...`
- New env vars are in `.env.example` with a fake value, never the real one
- No test data, screenshots or local files that weren't meant to be committed
- If the repo uses gitleaks, also run it on the branch commits:
  `gitleaks git -v --log-opts="origin/develop..HEAD"` (`detect`/`protect` are deprecated since v8.19)

## 4. Fresh-context self-review

The session that wrote the code is biased toward it. Get a review from a context that has
**not** seen your reasoning: give it only the ticket and the diff. Fix the findings that are real
(check each one against the code); ignore the ones that are wrong and say why in your summary.

**Prompt** (paste the ticket text and make sure the reviewer can run `git diff`):

```text
You are reviewing a pull request. You did not write it. Be critical.
Ticket: [paste ticket title, description and acceptance criteria]
Run: git diff origin/develop...HEAD  (and read any file you need for context)

Report only real problems, each with file:line, why it is a problem, and a fix:
1. Bugs: wrong logic, missed edge cases (empty, null, large input, concurrency), broken error handling.
2. Security: injection, missing auth or ownership checks, secrets, unsafe input, data leaks in logs or responses.
3. Performance: N+1 queries, work inside loops, missing pagination or indexes, memory leaks.
4. Patterns: anything that doesn't match how the rest of this codebase does it.
5. Scope: any change the ticket does not need, especially changed API responses or deleted files.
6. Tests: acceptance criteria with no test, or tests that can't fail.
Rank findings as must-fix / should-fix / nit. If you find nothing in a category, say so.
Do not edit any files.
```

**Claude Code:** pick one.
- Start a new session (`/clear`, or a new terminal running `claude` in the repo) and paste the prompt.
- Or, in the current session, ask: "Use a subagent to review this branch with this prompt: ...".
  A subagent starts with a clean context.
- Also run the built-ins as a second opinion: `/code-review` (bundled skill: correctness bugs in the
  current diff, or pass a branch/PR) and `/security-review` (diff vs origin's default branch; needs an
  `origin` remote). They don't know the ticket, so they don't replace the scope check above.

**Antigravity:** open a **new conversation** in the Agent Manager for the same workspace (not a
follow-up message in the conversation that wrote the code) and paste the prompt.

After fixing, rerun step 1.4 (full suite) and step 3 (script). The human reviewer's side of this
review is the `review-pr` skill.

## 5. Commits and PR size

**Commit messages: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).**
Format: `type(scope): short description in imperative mood`.

| Type | Use for |
|---|---|
| `feat` | New feature for users |
| `fix` | Bug fix |
| `refactor` | Code change with no behaviour change |
| `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style` | As named |

- Breaking change: add `!` (`feat(api)!: remove v1 orders endpoint`) and a `BREAKING CHANGE:` footer.
- Put the ticket id in the body or footer (`Refs: PROJ-123`). Use the same format for the PR title.
- Bad: `fix bug`, `updates`, `wip`. Good: `fix(auth): refresh token before it expires`.

**Keep PRs small and focused.** One ticket, one concern.
- Around 100 changed lines is easy to review well; around 1000 is usually too large. The script
  warns above 400 (lock files excluded). If you are over that, see if it can be split.
- Split refactors from behaviour changes: refactor in one PR, feature in the next.
- Split by layer or slice (e.g. migration + API first, UI next). Each PR must leave the build working.
- Tests for a change go in the same PR as the change.
- **Stacked PRs** when part 2 needs part 1: branch part 2 off part 1's branch and open its PR with
  `--base` = part 1's branch. Say "Depends on #N" in the description. After part 1 merges, rebase
  part 2 onto the target and change its base back to the target.
- 200 lines in one file can be fine; the same 200 lines across 50 files usually is not.

## 6. PR description

Use the template in [references/pull_request_template.md](references/pull_request_template.md).
(It can also be copied to `.github/pull_request_template.md` so GitHub pre-fills every PR.)
It must contain:

- **What and why**, readable without opening the ticket, plus the ticket link
- **Tests run with pasted output** (test, lint, typecheck, build, and the check-diff result)
- **UI evidence** when the UI changed: Playwright screenshots, before and after, desktop and mobile width
- **Docs updated** (README, API docs, `.env.example`) or why not needed
- **Risks and rollback plan**
- **Deploy notes**: new env vars, DB migrations, other deploy steps. Write "None" if none.

Before you submit, reread the description against the final diff. It must match what the PR does now.

## 7. Open the PR, link the card, watch CI

```bash
git push -u origin HEAD                       # after a rebase: git push --force-with-lease
gh pr create --draft --base develop --title "feat(orders): add CSV export" --body-file pr-body.md
gh pr checks --watch                          # wait for the required CI checks
gh pr ready                                   # draft -> ready for review once all green
```

- Open as **draft** while CI runs or anything is unfinished; draft PRs can't be merged and don't
  ask code owners for review. Mark ready only when CI is green and the DoD below is ticked.
- **Required checks:** branch protection can require named CI checks to pass and the branch to be up
  to date with the target. A red required check = fix it here, never ask to bypass it. Pushing new
  commits may dismiss existing approvals, so tell the reviewer what changed.
- `CODEOWNERS` (`.github/`, root or `docs/`) adds owners as reviewers automatically; don't remove them.
- `Closes #123` in the description closes a GitHub issue on merge, but only when the PR targets the
  **default** branch. For a NextSprint card, put the PR link on the card and move it to review with the
  `nextsprint-workflow` skill.
- Write `pr-body.md` outside the repo (or delete it after), so it never gets committed.

## Definition of done (check before saying "ready")

- [ ] Rebased (or merged) on the latest target branch; conflicts resolved keeping both intents
- [ ] Full test suite, lint, typecheck and build pass **on the synced branch** (output pasted)
- [ ] Every changed file belongs to the ticket; no reformatting, drive-by refactors or deleted files
- [ ] No existing API response shape, status code or public interface changed (unless the ticket says so)
- [ ] `check-diff.mjs` passes with 0 errors; warnings fixed or explained
- [ ] No secrets, `.env`, debug logging, temp files, commented-out code, or ticketless TODOs
- [ ] Fresh-context review done; real findings fixed; suite rerun after the fixes
- [ ] Commits and PR title follow Conventional Commits
- [ ] PR description filled from the template, including deploy notes and rollback
- [ ] Required CI checks green on the PR; PR moved out of draft; PR link on the board card

## Red flags: stop and fix

- "Tests pass" or "ready for review" without command output in this session
- Tests were run before the rebase but not after
- A conflict resolved with `--ours`/`--theirs` on a whole file without reading it
- The diff touches files the ticket never mentions, or deletes a file
- A whole file shows as changed but only a few lines were meant to change (formatter or line endings)
- An existing endpoint now returns a different shape or status
- `git push --force` (use `--force-with-lease`)
- PR over ~400 changed lines mixing a refactor with a feature
- The self-review was done in the same conversation that wrote the code
- Asking to skip or bypass a required CI check, or merging with checks still running
- Hand-edited files under `dist/`, `build/` or another generated folder

Credit: the "evidence before claims" gate is adapted from obra/superpowers
`verification-before-completion` (MIT). Secret patterns in the script are adapted from gitleaks (MIT).
