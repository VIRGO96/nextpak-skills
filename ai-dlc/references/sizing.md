# Sizing detail

Size decides how much process a task gets. The goal is the lightest process that is still safe:
teams drop heavy processes, and then nothing is followed at all.

## How to decide

1. Check the **Large triggers** first. Any one = Large, even for a 5-line change:
   - Login, signup, sessions, tokens, password reset, OTP
   - Payments, billing, refunds, invoices, pricing
   - Roles, permissions, access checks, multi-tenant scoping
   - Deleting data (hard or soft), bulk updates, data exports with personal data
   - DB migrations that change or move existing data
   - Changing an existing API contract other apps call
   - More than one repo, or more than ~2 days of work
2. Otherwise **Small** if all are true: about 1 hour or less, one file area (one module/component
   plus its test), behavior is obvious from the card, no new dependency, no new env var.
3. Everything else is **Normal**.
4. Unsure between two sizes = take the bigger one and say so. The developer can downgrade it.
5. Size can change. If Build uncovers a Large trigger, stop, re-size, and run the missing gates.

## Gates per size

| Gate | Small | Normal | Large / risky |
|---|---|---|---|
| Session start: read handoff + card comments | yes | yes | yes |
| Phase 0 readiness (`docs-keeper` A) | AGENTS.md exists + tests run | full if anything missing | full |
| Definition of Ready | yes (quick) | yes | yes, plus designs and API contract attached |
| Spec | 2-5 AC in a card comment | short spec on the card | spec file in `docs/specs/` |
| Product-thinker | one-line risk check | sections the card touches | full question bank |
| Approval before code | none; AC visible on card | developer OKs AC (a "go" is enough) | written approval of spec + plan |
| Branch from latest target | yes | yes | yes |
| Tests first (`testing-qa`) | yes | yes | yes, Level 3 edge cases |
| Browser checks | per `testing-qa` level | per level | per level (usually 3) |
| Decision record | rarely | if a real choice was made | each hard-to-reverse choice |
| `pr-ready` | yes | yes | yes, risky files flagged in the PR |
| `review-pr` (human reviewer) | yes | yes | yes; reviewer told which parts are risky |
| `release-checklist` | normal deploy | normal deploy | full: migrations, env, flags, rollback, staging + prod smoke |
| `docs-keeper` close-out | handoff only if session ends | section B | section B + C |

## Examples

| Card | Size | Why |
|---|---|---|
| Fix typo on pricing page | Small | copy only, one file |
| Add "phone" field to profile form (optional) | Normal | UI + API + DB column, but additive and no risky area |
| Add CSV export of orders | Normal | one repo, read-only; Large if the export has personal data for other users |
| Admin can delete a user | Large | deletes data + permissions |
| Add Stripe coupon support | Large | payments |
| Rename `status` to `state` in `/orders` response | Large | breaking API contract |
| Bump a patch dependency | Small (chore) | if tests stay green; Normal if it's a major version |
| Login button does nothing on Safari | Large (bug) | touches login; still a short bug form, but Level 3 checks |

## What "light" means for Small

- No spec file, no separate approval round. The AC comment on the card *is* the spec.
- Still: branch, failing test first, green suite with output, `pr-ready`, review. These are cheap
  and catch most mistakes; skipping them is not "light", it is unsafe.
