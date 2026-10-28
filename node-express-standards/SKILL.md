---
name: node-express-standards
description: Use when writing or changing code in a Node.js + Express backend (TypeScript or JavaScript) - adding or fixing an API endpoint, route, controller, service, middleware, request validation, error handling, logging, auth, role or ownership check, pagination, file upload, webhook, payment or third-party API call, or Supertest tests, including bug fixes and refactors. Typical asks - add an API to cancel orders, create the users endpoint, add validation, protect this route with auth, handle the webhook, the API returns 500 so fix it, add pagination. Keywords - Express, Node API, REST, Zod, Pino, JWT, middleware, Supertest. Not for Next.js API routes, NestJS, FastAPI or frontend code.
metadata:
  author: NextPak AI Team
  version: 0.3.0
---

# Node.js + Express Standards

Follow these rules for every change in an Express backend. Goal: code that passes
review and QA the first time.

## 0. Before writing code

1. Read the project's `AGENTS.md` / `CLAUDE.md` and any domain doc for the area you touch.
2. Look at 1-2 existing modules and **match their patterns**. If the project already uses a
   different library (Joi, Winston, Prisma...), keep using it. Never add a second library
   for the same job.
3. The defaults below apply to new projects, or to code that has no pattern yet.

## CRITICAL: stay inside the ticket's scope

- **Never change an existing endpoint's response shape or status codes** (e.g. wrapping `/me` in
  `{ data }`, changing an existing error body). That breaks the frontend and mobile apps. New
  endpoints can use the conventions below; existing ones stay as they are unless the ticket says so.
- **Don't move, rename or delete existing files** to fit the structure below. Put new code in the new
  structure; refactoring old code is its own ticket.
- If a rule below would need a big change (new logger, new folder layout for old code), do the minimum
  for the ticket and list the rest under "Follow-ups" in your summary.

## 1. Default stack (new projects)

| Job | Use |
|---|---|
| Framework | Express 5 + TypeScript |
| Validation | Zod (request body, params, query, and env vars) |
| Logging | Pino + pino-http (JSON logs, request id) |
| Security headers | helmet |
| CORS | `cors` with an explicit origin allowlist |
| Rate limiting | express-rate-limit (always on login, signup, OTP, password reset) |
| Tests | Vitest or Jest + Supertest |

## 2. Project structure (by feature)

```
src/
  app.ts            # builds the express app (no listen) - imported by tests
  server.ts         # listen + graceful shutdown
  config/env.ts     # validated env, fails fast on startup
  lib/logger.ts     # one pino instance
  lib/errors.ts     # AppError + subclasses
  middleware/       # validate, auth, errorHandler, notFound
  modules/<feature>/
    <feature>.routes.ts      # paths + middleware only
    <feature>.controller.ts  # read validated input, call service, send response
    <feature>.service.ts     # business logic, no req/res here
    <feature>.repository.ts  # DB access only
    <feature>.schema.ts      # zod schemas + inferred types
tests/
```

Rules:
- Routes have no logic. Services never touch `req`/`res`. Only repositories talk to the DB.
- `app.ts` must not call `listen()`, so tests can import the app.

## 3. Validation

- Validate **every** input at the edge: `body`, `params`, `query`. Never trust `req.body`.
- Body schemas reject extra fields (blocks mass-assignment): `z.strictObject({...})` in Zod 4,
  `z.object({...}).strict()` in Zod 3. Check the project's Zod version before copying syntax.
- Coerce types for query and params (`z.coerce.number()`), with min/max limits on pagination.
- Express 5: `req.query` is read-only. Store parsed values in `res.locals.validated`, don't reassign `req.query`.
- Express 5: `req.body` is `undefined` when no body parser ran; wildcard routes need a name (`/*splat`),
  optional parts use braces (`/:file{.:ext}`), no regex chars in paths.
- Set a body size limit: `express.json({ limit: '100kb' })`.

## 4. Errors

- Throw `AppError` subclasses (`NotFoundError`, `ValidationError`, `UnauthorizedError`,
  `ForbiddenError`, `ConflictError`). Never `throw 'string'` or `res.status(500)` in random places.
- Express 5 passes rejected promises from async handlers to the error handler, so you don't need
  `try/catch` or `asyncHandler` wrappers just to forward errors. Use `try/catch` only when you can actually handle the error.
- One central `errorHandler`, registered **last**. One response shape for every error:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "User not found", "requestId": "..." } }
  ```
- Unknown errors: log the full error, return `500` with a generic message. Never send a stack trace
  or DB error text to the client.
- Use the correct status codes: 400 validation, 401 not logged in, 403 not allowed, 404 not found,
  409 conflict, 422 business rule, 429 rate limit, 500 unexpected.
- `unhandledRejection` / `uncaughtException`: log at `fatal`, then exit. Let the process manager
  (PM2, Docker, K8s) restart it. Don't keep running in an unknown state.

## 5. Logging

- Use the shared Pino logger. **No `console.log`** in committed code.
- If the project has no logger yet: don't add one inside a feature ticket. Use `console.error` only in
  the central error handler, and list "add Pino logger" as a follow-up.
- Every request gets a request id (reuse incoming `x-request-id`, else generate one). Return it in
  the response header and include it in error responses so QA can report it.
- Inside handlers use `req.log`, so the request id is attached automatically.
- Redact secrets: `authorization`, `cookie`, `password`, `token`, `apiKey`, card data.
- Levels: `error` = needs action, `warn` = unexpected but handled, `info` = business events
  (order created), `debug` = dev detail. Log an error **once** (in the error handler), not at every layer.
- Production logs are JSON. Pretty printing is for local dev only.

## 6. Security

- `app.use(helmet())`, CORS allowlist from env, `app.disable('x-powered-by')` (helmet already does this).
- **Authorization on every resource**: check that the logged-in user owns or may access the record,
  not just that they are logged in. (Most common real bug: user A can open user B's data by changing an id.)
- **Admin/staff routes** need `requireRole('admin')` (or on the whole admin router). A hidden URL is not
  protection. Fields a user may not see or change get their own schema/DTO.
- JWT: `jwt.verify` with a pinned `algorithms` list, require `exp`, check `audience`/`issuer` for IdP tokens,
  short-lived access tokens. Never `jwt.decode()` for auth. Token cookies: `httpOnly`, `secure`, `sameSite`.
- Behind a load balancer set `app.set('trust proxy', 1)` (the real hop count, never `true`), or rate limits and
  logged IPs use the proxy's IP. CORS with `credentials: true` needs an explicit origin list, never `*`/reflect-all.
- Queries are parameterized or go through the ORM. Never build SQL with string concatenation.
- Never return password hashes, tokens, or internal fields. Map DB rows to response DTOs.
- Secrets come from env only. Never log, commit, or hardcode them.
- `npm audit` has no high or critical issues before merge.

## 6a. Webhooks, payments, uploads and outbound calls

- **Webhooks**: mount before `express.json()` with `express.raw()`, verify the signature on the raw bytes
  (provider SDK or `timingSafeEqual`), reject old timestamps, fail closed if the secret is unset. Process each
  event id once (unique index) because providers retry; answer 2xx fast, slow work goes to a queue.
- **Payments / order creation**: support an `Idempotency-Key` header so a retry or double click can't charge twice.
- **Uploads**: multer 2.x with `limits` (fileSize, files), a type allowlist, never use `originalname` as a path.
- **Outbound HTTP**: every call has a timeout (`AbortSignal.timeout(ms)`; Node `fetch` otherwise waits ~5 minutes); handle
  third-party timeouts and 5xx; validate what comes back. User-supplied URLs pass an SSRF check (no private or
  metadata IPs, no redirects). Code for all four: [references/examples.md](references/examples.md).

## 7. Config

- All env vars are parsed by `config/env.ts` (Zod) at startup. Missing or invalid value means the app
  refuses to start, with a clear message.
- Code reads `env.X`, never `process.env.X` directly.
- Every new env var goes in `.env.example` and is mentioned in the PR description.

## 8. API conventions

- Prefix: `/api/v1/...`. Plural nouns: `/users/:id/orders`.
- Success responses: `{ "data": ... }`, lists: `{ "data": [...], "meta": { "page", "limit", "total" } }`.
- Pagination is required on list endpoints (default limit 20, max 100).
- `GET /healthz` (process alive) and `GET /readyz` (DB and dependencies reachable).
- Multi-step writes that must succeed together run inside a DB transaction.
- Avoid N+1 queries: no DB call inside a loop over results.

## 9. Testing (write tests first)

1. Before implementing, write the test cases from the spec's acceptance criteria.
2. Run them and **watch them fail** for the right reason. Paste that failing output in your summary.
   No failing output = the step was skipped. "I wrote them alongside the code" does not count.
3. Implement until green.

Minimum per endpoint (Supertest against `app`):
- Happy path (correct status and response shape)
- Validation failure → 400 with `VALIDATION_ERROR`
- No auth → 401; wrong user or role → 403 (incl. an admin route called by a normal user)
- Not found → 404
- Any business rule from the spec (e.g. duplicate → 409)

Unit tests for services with real logic. Mock only external services (payments, email, third-party APIs),
not your own code.

## 10. Graceful shutdown

On `SIGTERM`/`SIGINT`: stop accepting connections (`server.close()`), finish in-flight requests,
close DB and queue connections, then exit. Force exit after ~10s.

## Definition of done (check before saying "done")

- [ ] Matches existing project patterns; no duplicate libraries added
- [ ] No existing endpoint's response shape changed; no existing files moved or deleted
- [ ] Malformed JSON and unknown routes return JSON errors (not Express's default HTML)
- [ ] List endpoints are paginated with a max limit
- [ ] All inputs validated with Zod; body schemas reject unknown fields (strict)
- [ ] Errors go through `AppError` + central handler; no stack traces in responses
- [ ] No `console.log`; secrets redacted; request id present
- [ ] Ownership/role check on every resource endpoint and admin route
- [ ] Webhooks verify signatures and are idempotent; outbound calls have timeouts; uploads have limits
- [ ] New env vars validated + added to `.env.example`
- [ ] Tests written first; failing output shown before implementation; all green now
- [ ] `lint`, `typecheck`, `test` all pass locally (paste the output, don't just claim it)

## Red flags: stop and fix

- Business logic or DB calls inside a route file
- `res.status(500).json(err)` or `err.message` sent straight to the client
- `catch (e) {}` or `catch (e) { console.log(e) }`
- `process.env.SOMETHING` outside `config/env.ts`
- An endpoint that takes an `:id` but never checks who owns it; an `/admin` route with only `requireAuth`
- `jwt.decode()` used for auth, or `jwt.verify` without `algorithms`
- A webhook handler behind `express.json()` (signature can't be checked); `fetch`/axios with no timeout
- "Tests pass" without showing the command output

## Reference code

Working templates for every rule above: [references/examples.md](references/examples.md).
Read it when creating a new project or adding a piece that doesn't exist yet.
