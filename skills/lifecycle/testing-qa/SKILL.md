---
name: testing-qa
description: Use when implementing a feature, fixing a bug, or changing behavior in any stack (Node/Express, FastAPI, React, Next.js) and the work needs a decision on what to test and proof that it works - turning acceptance criteria into test cases, writing tests first, edge cases (validation, 401/403, ownership, duplicates, pagination, double submit, network failure, time zones), API mocking with MSW, flaky tests, test data isolation, Vitest, Jest, pytest, Supertest, React Testing Library, Playwright or Playwright MCP browser checks, regression tests for bugs, and QA evidence for a PR. Triggers - write tests for this endpoint, add tests for this feature, test the edge cases before QA, write a failing test for this bug, this test is flaky, verify it in the browser. How to build the feature itself is the stack skill's job (react-next-standards, node-express-standards, fastapi-standards). Not for load/performance testing or setting up CI pipelines.
metadata:
  author: NextPak AI Team
  version: 0.2.2
---

# Testing & QA

Goal: QA finds nothing new, and the reviewer sees proof instead of promises.
Applies to every task that changes behavior, in any stack.

## CRITICAL rules (read these even if you skip the rest)

1. **No implementation code before a failing test.** Write the test cases from the acceptance
   criteria, run them, and watch them fail. Then implement.
2. **Paste the failing output** in your summary. No failing output = the step was skipped.
   "I wrote the tests alongside the code" or "together with the code" does **not** count. If you
   already wrote the code, stash or comment it out, run the tests, see them fail, then restore.
3. **It must fail for the right reason**: an assertion on the missing behavior
   (`expected 404 to be 201`), not a typo, import error, or syntax error. A test that passes
   before the code exists proves nothing: make the assertion stricter until it fails.
4. **Pick the browser-check level from the risk table** (section 3). Don't skip it, don't overdo it.
5. **Bug fix = reproduce first.** A test that fails because of the bug, then the fix.
6. **"Done" means command output shown**, not claimed. "Tests pass" without output = not done.

## CRITICAL: stay inside the ticket's scope

- Test the behavior the ticket changes, plus the edge cases from section 4 that apply to it.
- Don't rewrite or delete existing tests to make yours pass. If an existing test breaks, either
  your change has a bug or the spec changed. Say which one in your summary.
- Don't add a new test framework. Use what the project already has (Jest stays Jest, unittest
  stays unittest). Defaults below are only for projects with no tests yet.
- If the project has no test setup at all, add the minimum for your ticket and list
  "add test setup to CI" under Follow-ups.

## 1. Default tools (only when the project has none)

| Stack | Unit / API | UI components | Browser (E2E) |
|---|---|---|---|
| Node / Express | Vitest (or Jest) + Supertest | - | - |
| Python / FastAPI | pytest + `TestClient` (httpx) | - | - |
| React / Next.js | Vitest or Jest | React Testing Library + user-event, MSW for API responses | Playwright |

Where tests go: mostly **integration-level** tests (API through HTTP, component through the DOM),
unit tests for logic-heavy functions, few E2E tests for key journeys (the testing trophy / pyramid).
Push each check to the lowest level that can catch the bug. Stack-specific test patterns (e.g.
Server Action tests) live in the stack skill; this skill decides what to test and how to prove it.

## 2. Workflow: tests first (every task)

1. **List the cases.** Read the spec's acceptance criteria. Write one test case per criterion,
   then walk the edge-case checklist (section 4) and add the ones that apply. Write the list in
   your plan before any code.
2. **Write the tests.** Names describe behavior: `403 when user B reads user A's note`, not `test2`.
3. **RED: run them and watch them fail.** Paste the output. Check each failure message is the one
   you expected. Any test that passes now: tighten it (see rule 3).
4. **GREEN: implement the minimum** to make them pass. Don't change the tests to fit the code.
5. **Run the whole suite**, plus `lint` and `typecheck`. Paste the output.
6. **Browser check** at the level the risk table says (section 3). Save the evidence.

If the `test-driven-development` skill (obra/superpowers) is installed, use it too. This skill
adds our risk levels, edge cases and evidence rules on top.

## 3. Risk levels: how much checking a change needs

Find every row your change touches. **The highest row wins.** Unsure? Go one level up.

| Level | The change touches | Required checks | Evidence in the PR |
|---|---|---|---|
| **0** | Docs, comments, config with no behavior change, copy/text or styling only | Existing suite still green. UI copy/style: one screenshot of the changed screen | Suite output (+ screenshot) |
| **1** | Backend only: API endpoint, service, job, query, migration, util. No UI change | Automated tests first (section 2) incl. edge cases. **No browser run needed** | RED output + GREEN output |
| **2** | UI behavior: component, page, form, routing, client state, or an API the UI calls changes shape | Level 1 + component tests + **one Playwright run of the changed feature's main user journey**, with no console errors (incl. hydration warnings) | Level 1 + journey result + screenshot of the end state |
| **3** | High-risk: login, signup, session, auth tokens, payments/billing, roles or permissions, deleting data, multi-step flows (checkout, onboarding, wizards), bulk updates | Level 2 (or Level 1 if no UI) + an **edge-case pass**: cross-user 403, double submit, refresh mid-flow, failed network, expired session (whichever apply) | Level 2 + one result line + screenshot per edge case |

Notes:
- Level 3 backend-only work (e.g. a permissions check in an API) still needs the cross-user,
  duplicate and expired-token cases as automated tests. The browser part only applies if UI changed.
- "One Playwright run" = the happy path of the journey you changed, end to end, once. Not the
  whole app, not three rounds.
- If a Playwright test for that journey already exists, run it (and extend it) instead of a manual MCP run.

## 4. Edge-case checklist (walk it while writing cases)

Go down the list. For each item: does it apply to this change? If yes, it's a test case.

| Area | Case | Expected (typical) |
|---|---|---|
| Validation | Missing field, wrong type, empty string, too long, out of range | 400 / 422, field-level message |
| Malformed input | Broken JSON, wrong content type, extra unknown fields | 400 / 422, JSON error (not an HTML page) |
| Auth | No token / invalid token | 401 |
| Expired session | Token or session expired mid-use | 401 + UI sends user to login, keeps no stale data |
| Ownership / role | User A reads, edits or deletes user B's record by changing the id; normal user calls admin action | 403 (or 404 if the project hides existence) |
| Not found | Unknown id, deleted record | 404 |
| Duplicates / conflicts | Same email twice, same item twice, stale update | 409 |
| Pagination | `limit=0`, `limit` over max, negative `page`, page past the end | Clamped or 400; empty list, not error |
| Empty states | No data yet, search with no results | Friendly empty state, no crash |
| Double submit | Double click, Enter pressed twice | One request / one record; button disabled while pending |
| Refresh mid-flow | Reload on step 2 of a wizard or after payment redirect | Resumes or restarts cleanly, no double charge |
| Slow / failed network | API returns 500, times out, or is offline | Error message shown, user can retry, no half-saved state |
| Optimistic UI | Server rejects an update the UI already showed | Old value restored, error shown |
| Dates / time zones | User in UTC+5 near midnight; DST change; "today" filters | Right day and time for the user's zone; same text server and browser |
| Unsafe text | `<script>alert(1)</script>` or `javascript:` URL in a text/link field | Shown as plain text / link refused; nothing executes |

## 5. Browser checks with Playwright

Follow Playwright's own best practices:
- **Locators by role/label/text**: `getByRole('button', { name: 'Save' })`, `getByLabel('Email')`.
  Not CSS classes or XPath. `getByTestId` only when nothing user-facing works.
- **Web-first assertions** that retry: `await expect(locator).toBeVisible()`.
  **Never `waitForTimeout` / `sleep`.** Fixed waits make tests slow and flaky.
- **Isolated tests**: each test sets up its own data and login state; no test depends on another.
- **Mock third parties** (payment provider, email) with `page.route`, not your own API.
- Test what the user sees, not implementation details.

**Playwright MCP** (manual/agent run, when there is no Playwright test yet). Install for Claude Code:
`claude mcp add playwright npx @playwright/mcp@latest`; Antigravity: add the same command as an MCP server.
Playwright's README also offers `@playwright/cli` + skills as a lower-token option for coding agents;
either is fine, the evidence rules are the same.
Prompt it with a concrete journey and explicit checks, for example:

> Using Playwright MCP, open http://localhost:3000/login, sign in as qa-admin@example.com /
> (password from .env.test). Go to Team, invite sara@example.com. Check that "Invite sent" appears
> and sara@example.com is in Pending invites. Take a screenshot named
> `qa-evidence/invite-sent.png`. Then report: steps done, what you saw, console errors, failed
> network requests.

- Use `browser_snapshot` (accessibility tree) to find elements, `browser_take_screenshot` for evidence,
  `browser_console_messages` and `browser_network_requests` to catch hidden errors.
- Save evidence in `qa-evidence/` (git-ignored) and attach it to the PR, not commit it.
- Never type real customer data or production credentials. Use test accounts on local/staging.

Runnable examples: [references/playwright.md](references/playwright.md).

## 6. Mocks, test data and flaky tests

Details + verified MSW example: [references/mocking-and-flaky-tests.md](references/mocking-and-flaky-tests.md).

- **Mock the network edge, not your own code.** Component tests use MSW handlers typed with the app's
  real API types; `vi.mock` of your own api-client/hooks tests the mock. Playwright mocks only third parties.
- **Every test owns its data**: unique emails/ids, reset state in `beforeEach`, separate test DB. A test
  must pass alone, in any order, and twice in a row.
- **Control time**: fake timers / `setSystemTime` in unit tests, `page.clock` + `timezoneId` in Playwright.
- **A flaky test is a bug.** Find the cause (fixed waits, shared state, real time, real third parties,
  missing `await`). Don't add retries or sleeps to hide it. Prove the fix with `--repeat-each`.

## 7. Bug fixes

1. **Reproduce in a test first**, at the lowest level that shows the bug (API test before E2E).
2. Run it: it must **fail because of the bug**. Paste the output.
3. Find the root cause before changing code. For anything not obvious after one look, use the
   `systematic-debugging` skill (obra/superpowers): read the error, reproduce, trace back to the
   source, one hypothesis at a time. No guess-and-check fixes.
4. Fix, watch the test go green, run the full suite.
5. Keep the test. It is the regression guard.

## Rationalizations: all of these mean "go back and do it"

| Excuse | Reality |
|---|---|
| "I wrote the tests alongside the code" | Then you never saw them fail. Stash the code, run, show RED. |
| "Too simple to need a test" | Simple code breaks too. The test takes a minute. |
| "I'll add tests after" | Tests written after pass immediately and prove nothing. |
| "I tested it manually / in the browser" | Not repeatable, not shown. Write the test, paste the output. |
| "The test passed on the first run, great" | It tests nothing new. Tighten it until it fails without your code. |
| "Playwright for this backend change" / "skip it, UI change is tiny" | Use the risk table, not a feeling. |
| "The failure was an import error, close enough" | Wrong reason. Fix the setup, get an assertion failure. |
| "Edge cases are QA's job" | Every edge case QA finds is a bug ticket with your name on it. |

## Definition of done (check before saying "done")

- [ ] Test cases listed from acceptance criteria + edge-case checklist before coding
- [ ] Failing (RED) output pasted, failing for the right reason
- [ ] All tests green now; full suite, `lint`, `typecheck` output pasted
- [ ] Risk level stated (0-3) with the reason, and its checks done
- [ ] Level 2+: Playwright journey result + screenshot attached
- [ ] Level 3: edge-case pass results + screenshots attached
- [ ] Bug fix: reproducing test failed before the fix, passes after
- [ ] No existing tests deleted or weakened to get green
- [ ] No fixed sleeps, no CSS/XPath locators where a role works, no shared state between tests
- [ ] API mocks at the network edge (MSW / `page.route` for third parties), typed with real API types

## Red flags: stop and fix

- Implementation written before any test ran
- No RED output, or RED output that is an import/syntax error
- A test that passed the first time it ran and was never tightened
- `waitForTimeout`, `sleep(3000)`, or `.nth(2)` on a CSS selector in a test
- An endpoint with `:id` and no test for another user's id
- "Should work", "tests pass", "verified" without command output
- Mocking your own service or database layer just to make a test pass
- Retries or a longer timeout added to make a flaky test "pass"
- A fixed email/id in a test that creates records (fails on the second run or in parallel)

## Reference code

One runnable example per stack (each was run before publishing):
- [references/node-vitest-supertest.md](references/node-vitest-supertest.md): Express API, Vitest + Supertest
- [references/python-pytest.md](references/python-pytest.md): FastAPI, pytest + TestClient
- [references/react-testing-library.md](references/react-testing-library.md): React component, RTL + user-event
- [references/playwright.md](references/playwright.md): Playwright test, config, MCP evidence
- [references/mocking-and-flaky-tests.md](references/mocking-and-flaky-tests.md): MSW, data isolation, flaky-test causes and fixes

Credits: the tests-first discipline, "watch it fail" and rationalization ideas are adapted from
obra/superpowers `test-driven-development` (MIT).
