# Security checklist for code review

Use on every PR during pass 2. Grouped by [OWASP Top 10 2025](https://top10.owasp.org/2025)
category, with what to look for in a diff. Based on the
[OWASP Code Review Guide v2](https://wiki.owasp.org/images/5/53/OWASP_Code_Review_Guide_v2.pdf)
("check authz upon every request") and the stack skills' security sections.

For each item: if the diff touches it, trace the code path (route -> middleware -> handler ->
service -> query) before writing a finding. Not touched = skip it.

## Contents

- A01 Broken Access Control (most common real bug)
- A02 Security Misconfiguration
- A03 Software Supply Chain Failures
- A04 Cryptographic Failures
- A05 Injection
- A06 Insecure Design
- A07 Authentication Failures
- A08 Software or Data Integrity Failures
- A09 Security Logging and Alerting Failures
- A10 Mishandling of Exceptional Conditions
- Secrets and data exposure (every PR)
- Sources

## A01 Broken Access Control (most common real bug)

- [ ] Every new or changed route has an auth guard. Check the router setup, not only the handler:
      a router-level `router.use(requireAuth)` counts.
- [ ] **Ownership (IDOR):** any `:id` in params, body or query that loads a record is checked against
      the logged-in user (or their org/tenant). Look for `findById(req.params.id)` followed by a write
      or a response with no `userId`/`orgId` comparison. Best form: query by both
      (`WHERE id = $1 AND user_id = $2`) and return 404.
- [ ] Role checks for admin-only actions happen on the server, not only by hiding UI buttons.
- [ ] List endpoints filter by owner/tenant; a missing filter leaks every user's rows.
- [ ] Next.js: Server Actions and Route Handlers check the session themselves; middleware alone is not enough.
- [ ] CORS: no `origin: '*'` with credentials; allowlist from env.

Scenario to write: "user B (id 2) calls `GET /api/v1/invoices/1` and receives user A's invoice."

## A02 Security Misconfiguration

- [ ] No debug mode, verbose errors or stack traces returned to clients (`err.message`, `err.stack` in responses).
- [ ] New config defaults are safe (feature flags off, strict CORS, secure cookies: `httpOnly`, `secure`, `sameSite`).
- [ ] `helmet()` (Express) / security headers not removed.

## A03 Software Supply Chain Failures

- [ ] New dependency: is it needed (no second library for the same job), maintained, and pinned via the lock file?
- [ ] Lock file changes match `package.json` / `pyproject` changes; no unexplained lock churn.
- [ ] `npm audit` / `pip-audit` has no new high or critical issue.
- [ ] CI/workflow edits: no new secrets exposure, no `pull_request_target` running untrusted code.

## A04 Cryptographic Failures

- [ ] Passwords hashed with bcrypt/argon2/scrypt, never MD5/SHA1/plain SHA256.
- [ ] Tokens and ids that must be unguessable use a crypto RNG (`crypto.randomUUID`, `secrets`), not `Math.random`.
- [ ] No sensitive data sent over plain HTTP or stored unencrypted when the domain doc says encrypted.

## A05 Injection

- [ ] SQL built with string concatenation or template literals containing input. Must be parameterized or ORM.
- [ ] Raw ORM escapes (`$queryRawUnsafe`, `sequelize.literal`, `text()` with f-strings) fed with input.
- [ ] NoSQL: objects from `req.body` passed straight into a Mongo filter (`{ $ne: null }` login bypass).
- [ ] Shell: `exec`/`subprocess` with input; use argument arrays, never `shell: true` with input.
- [ ] XSS: `dangerouslySetInnerHTML`, `innerHTML`, `v-html`, template `|safe` on user content without sanitizing.
- [ ] Path traversal: file paths built from input (`../`); normalize and check against a base dir.
- [ ] SSRF: server fetches a URL supplied by the user without an allowlist.

## A06 Insecure Design

- [ ] **Input validation at the edge** for body, params and query (Zod / Pydantic), with types, lengths,
      ranges and `.strict()` / `extra="forbid"` to block mass-assignment.
- [ ] No raw `req.body` spread into a DB update (`{ ...req.body }` lets a user set `role`, `userId`, `price`).
- [ ] Business rules enforced server-side (price, quantity, status transitions), not trusted from the client.
- [ ] Rate limiting on login, signup, OTP, password reset, and expensive endpoints.
- [ ] Multi-step writes in a transaction; idempotency on payment/webhook handlers.

## A07 Authentication Failures

- [ ] Session/JWT: signature verified, expiry checked, algorithm fixed (no `alg: none`), refresh tokens rotated.
- [ ] Password reset / magic-link tokens: single use, short expiry, compared in constant time.
- [ ] Login errors don't reveal whether the email exists.

## A08 Software or Data Integrity Failures

- [ ] Webhooks verify the provider's signature (Stripe, GitHub) before acting.
- [ ] No deserializing untrusted data with `pickle`, `yaml.load` (unsafe loader), `eval`, `new Function`.

## A09 Security Logging and Alerting Failures

- [ ] **No secrets or personal data in logs:** passwords, tokens, `authorization` / `cookie` headers,
      card data, full request bodies of auth routes.
- [ ] Security-relevant events (failed logins, permission denials, admin actions) are logged once with a request id.
- [ ] Errors not silently swallowed (`catch (e) {}`).

## A10 Mishandling of Exceptional Conditions

- [ ] Errors fail closed: an exception in an auth/permission check denies access, never allows.
- [ ] Unknown errors return a generic 500, the details go to the log only.
- [ ] Timeouts and retries on external calls; partial failures don't leave half-written data.

## Secrets and data exposure (every PR)

- [ ] No keys, tokens, passwords or connection strings in code, tests, fixtures or config. A committed real
      secret must be **rotated**; deleting it later doesn't remove it from git history. For a quick
      pattern scan, run from the reviewed repo's root:
      `node <skills-folder>/pr-ready/scripts/check-diff.mjs --base <target branch>`. It doesn't catch reformats.
- [ ] No `.env`, key files or dumps committed. New env vars in `.env.example` with fake values.
- [ ] Responses map DB rows to DTOs: no password hashes, tokens, internal flags or other users' fields.
- [ ] Error messages don't leak SQL, file paths or library versions.

## Sources

- OWASP Top 10 2025: https://top10.owasp.org/2025
- OWASP Code Review Guide v2: https://wiki.owasp.org/images/5/53/OWASP_Code_Review_Guide_v2.pdf
- OWASP Reviewing Code for Authorization Issues: https://wiki.owasp.org/index.php/Reviewing_Code_for_Authorization_Issues
