<!--
NextPak PR template. Copy to .github/pull_request_template.md in a repo so GitHub pre-fills
every new PR (it only takes effect once merged into the default branch).
Delete sections that don't apply and write "N/A" where a reviewer might expect something.
PR title: Conventional Commits style, e.g. "feat(orders): add CSV export" or "fix(auth): refresh token on 401".
-->

## What and why

<!-- 1-3 sentences. What does this PR change, and what problem does it solve?
     A reviewer should understand it without opening the ticket. -->

**Ticket:** <!-- NextSprint card link. GitHub issue: "Closes #123" (auto-closes only when the PR targets the default branch). -->
**Depends on:** <!-- stacked PR? "#N", else delete this line -->

## Changes

<!-- Bullet list of the main changes, grouped by area. Mention anything a reviewer could miss. -->
-

## Out of scope / not changed

<!-- Anything you deliberately did NOT touch (existing endpoints, shared files),
     and follow-ups you found but left for another ticket. -->
-

## How it was tested

<!-- Paste the real command output (trimmed to the summary lines). "Tests pass" without output is not accepted. -->

- [ ] Rebased on the latest target branch, then ran everything below on the result

```text
$ <test command>
<paste summary: N passed, 0 failed>

$ <lint command>
<paste result>

$ <typecheck command>
<paste result>

$ <build command>
<paste result>

$ node <path-to>/pr-ready/scripts/check-diff.mjs --base <target>
<paste PASS line>
```

**Manual / QA steps:**
1.

## UI evidence (if the UI changed)

<!-- Before/after Playwright screenshots (desktop + mobile width), or a short video.
     Delete this section if there is no UI change. -->

| Before | After |
|---|---|
|  |  |

## Docs

- [ ] README / API docs / `.env.example` / changelog updated, or not needed because: ...

## Deploy notes

<!-- Write "None" for each line if nothing applies. -->
- **New env vars:** <!-- name, purpose, example value (never the real one); added to .env.example? -->
- **DB migrations:** <!-- name; reversible? safe to run before the code deploys? -->
- **Other deploy steps:** <!-- feature flags, cron jobs, cache clears, third-party config -->

## Risks and rollback

- **Risk:** <!-- what could break, who is affected -->
- **Rollback:** <!-- e.g. revert this PR; down-migration X; turn off flag Y -->

## Checklist

- [ ] Every changed file belongs to this ticket (no drive-by reformatting or refactors)
- [ ] No existing API response shape, status code or public interface changed unless the ticket asks for it
- [ ] No secrets, `.env` files, debug logging, temp files, commented-out code, or TODOs without a ticket
- [ ] Fresh-context self-review done and real findings fixed
- [ ] Tests added or updated for the changed behaviour
