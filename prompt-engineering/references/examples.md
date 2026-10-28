# Worked examples: rough prompt to polished prompt

Each example shows the developer's draft, what the agent found in the repo (step 2), the
questions it asked, and the polished prompt. Copy the shape, not the content: paths, fields
and commands must come from the real repo.

## Contents

- 1. Bug
- 2. Feature (backend endpoint)
- 3. Frontend
- 4. Tests
- 5. Refactor
- 6. Question or investigation
- 7. Role that changes the job (QA pass)
- 8. Small task (already good: change little)

## 1. Bug

**Draft:** `login nahi chal raha fix karo`

**Found in repo:** `src/routes/auth.ts` (`POST /api/v1/auth/login`), test command
`npm test`, no existing test for wrong-password vs right-password.

**What was missing:** goal (what "not working" means), evidence (error/status), done-check.

**Questions (reply "defaults" to accept):**
1. What happens: error status, wrong redirect, or hangs? - default: valid users get 401
2. Since when / which environment? - default: local and staging, since the last merge
3. Do you have the error text or a log line? Paste it. - default: none, reproduce first

**Polished prompt:**
```markdown
## Task
Users with a valid email and password get 401 from POST /api/v1/auth/login (local and
staging, since the last merge). Find the root cause and fix it.

## Context
- Express 5 API - follow `node-express-standards` and `systematic-debugging`
- Relevant code: src/routes/auth.ts, src/middleware/auth.ts
- Evidence: <paste response body / log line>

## Constraints
- Root cause first; no fix without a reproduction
- Don't change the login response shape or token format

## Done when
- A failing Supertest test reproduces the 401 for a valid user, then passes after the fix
- `npm test` passes; paste the output and state the root cause in one line
```

## 2. Feature (backend endpoint)

**Draft:** `users ka update endpoint bana do`

**Found in repo:** `src/routes/users.ts` has GET/POST, Zod schemas in the same file,
`requireAuth` middleware, tests in `tests/users.test.ts`.

**What was missing:** which fields, who may update whom, error cases, done-check.

**Questions:**
1. Which fields can change? - default: `name` and `phone` only
2. Can a user update other users, or only themselves? - default: only themselves; admins none
3. Partial update (PATCH) or full replace (PUT)? - default: PATCH

**Polished prompt:**
```markdown
## Task
Add PATCH /api/v1/users/me so a signed-in user can change their own name and phone.

## Context
- Express 5 + Zod - follow `node-express-standards`; copy the style of POST /users in
  src/routes/users.ts
- Auth: requireAuth from src/middleware/auth.ts

## Requirements
- Body: `name` (1-80 chars), `phone` (E.164); at least one required
- Unknown fields (e.g. `role`, `email`) rejected with 400 - no mass assignment
- 401 without a token; response shape same as GET /users/me

## Done when
- Tests first in tests/users.test.ts: success, empty body, unknown field, no token
- `npm test` passes; paste the output
```

## 3. Frontend

**Draft:** `settings page bana do`

**Found in repo:** Next.js App Router, forms use react-hook-form + Zod
(`app/(app)/profile/edit-form.tsx`), API client in `lib/api.ts`, `PATCH /users/me` exists.

**What was missing:** what's on the page, states, done-check.

**Questions:**
1. Which settings? - default: display name only, using PATCH /users/me
2. Where in the nav? - default: `/settings`, linked from the user menu

**Polished prompt:**
```markdown
## Task
Add a /settings page where the user changes their display name.

## Context
- Next.js App Router - follow `react-next-standards`
- Copy the form pattern in app/(app)/profile/edit-form.tsx; call PATCH /users/me via lib/api.ts

## Requirements
- Loading, error and success states; server validation errors shown on the field
- Submit disabled while saving; link from the user menu

## Done when
- Component test for validation and the error state
- `npm run build` and `npm test` pass; one Playwright run of the happy path (`testing-qa` level 2)
```

## 4. Tests

**Draft:** `orders ke tests likh do`

**Found in repo:** `src/routes/orders.ts` (list, create, cancel), no `tests/orders.test.ts`,
Vitest + Supertest set up in `tests/setup.ts`.

**What was missing:** which behaviors matter, done-check. Nothing to ask: the code answers it.

**Polished prompt:**
```markdown
## Task
Add tests for src/routes/orders.ts (list, create, cancel). No production code changes.

## Context
- Follow `testing-qa`; use the setup in tests/setup.ts and the style of tests/users.test.ts

## Requirements
- Per route: happy path, validation error, no token (401), another user's order (403)
- Cancel: only pending orders; cancelling a shipped order returns 409

## Done when
- `npm test` passes; paste the output. If a test exposes a real bug, stop and report it
  instead of changing production code.
```

## 5. Refactor

**Draft:** `users api ko better bana do`

**Found in repo:** `src/routes/users.ts` is 300 lines, validation inline, no service layer.

**What was missing:** what "better" means (it could mean anything), scope, done-check.

**Questions:**
1. Better how: readability/structure, performance, or new features? - default: structure only
2. Is any behavior change OK? - default: none; same requests give the same responses

**Polished prompt:**
```markdown
## Task
Refactor src/routes/users.ts for readability: move validation schemas and DB access out of
the route handlers. No behavior change.

## Context
- Follow `node-express-standards` (layout section)

## Constraints
- Same routes, status codes and response bodies; no new dependencies
- Propose the new file layout and wait for my OK before moving code

## Done when
- Existing tests pass unchanged before and after; paste both runs
```

## 6. Question or investigation

**Draft:** `auth mein issue hai dekh lo`

**Found in repo:** `src/middleware/auth.ts` verifies JWT; no `exp` check in options.

**What was missing:** the symptom. Without it the agent can only audit. Ask, and offer the audit.

**Questions:**
1. What issue do you see (error, user report, security worry)? - default: none; do a
   read-only review of the auth middleware

**Polished prompt:**
```markdown
## Task
Read-only review of src/middleware/auth.ts. Don't change any files.

## Requirements
- Check token verification (algorithm, expiry, issuer), error handling, and how the user is
  attached to the request
- Report each finding with file:line, impact, and a suggested fix

## Done when
- A list of findings ranked by severity, or "no issues found" with what you checked
```

## 7. Role that changes the job (QA pass)

**Draft:** `checkout form test kar lo`

**Found in repo:** `app/(shop)/checkout/form.tsx`, Playwright set up (`npm run e2e`), app runs
on `npm run dev`.

**What was missing:** what kind of testing, done-check. A role fits: the job is to break things,
not to build them.

**Polished prompt:**
```markdown
## Task
Act as a QA tester. Try to break the checkout form in app/(shop)/checkout/form.tsx before it
goes to QA. Don't fix anything yet.

## Requirements
- Edge cases: empty and very long fields, invalid card date, double submit, slow network,
  back button after submit, server 500
- Follow `testing-qa` (level 3: payments)

## Done when
- A table: case, steps, expected, actual, pass/fail
- Each failure has a Playwright test that reproduces it (`npm run e2e`)
```

## 8. Small task (already good: change little)

**Draft:** `Add GET /api/v1/health in src/app.ts returning 200 {"status":"ok"} without auth, with a Supertest test.`

**What was missing:** only the run step.

**Polished prompt:**
```markdown
Add GET /api/v1/health in src/app.ts returning 200 {"status":"ok"} without auth, with a
Supertest test in tests/. Run `npm test` and paste the output.
```
The draft was already clear; don't wrap it in the full template.
