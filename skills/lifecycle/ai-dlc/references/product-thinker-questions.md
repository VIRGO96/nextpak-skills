# Product-thinker question bank

Use in Plan (and keep in mind during Build). Go down the list; skip what doesn't apply.
Every question that applies ends up as one of:
- an **acceptance criterion** (and so a test),
- an **out-of-scope** line,
- a **`[NEEDS CLARIFICATION]`** for the developer or card owner,
- a **risk** with a mitigation.

Normal size: only the sections the card obviously touches (usually Users, States, Data).
Large: all sections. Report the result as a short list: "Gaps", "Risks", "Questions".

## Users and permissions
- Which roles can see / do this? What does each other role see (hidden, disabled, 403)?
- Can user A reach user B's records by changing an id in the URL or body?
- Multi-tenant: is every query scoped to the tenant/org?
- Logged out, expired session, or account disabled mid-flow: what happens?

## States and edge cases
- Empty state (no data yet), loading state, error state, partial data?
- Very long text, special characters, emoji, RTL text, zero, negative, huge numbers?
- Double click / double submit; two users editing the same record at once?
- Refresh or back button mid-flow; slow or failed network; timeouts?
- Pagination, sorting, filtering on big lists: what limits?

## Data
- New fields: required or optional? Default for existing rows? Backfill needed?
- Migration on a large table: lock time, reversible, run before or after deploy?
- Deleting: soft or hard delete? What happens to related records? Can it be undone?
- Who owns the data (privacy, PII, retention, export)?

## API and compatibility
- Does any existing endpoint, response shape or status code change? Who calls it (web, admin, mobile, third parties)?
- Can the old frontend/mobile app keep working during deploy (backend first, additive change)?
- Webhooks / background jobs: retries, idempotency, ordering?
- Rate limits, file size limits, timeouts?

## Business rules
- What are the exact rules (limits, rounding, time zones, currency)? Who confirmed them?
- What happens at the boundary (exactly at the limit, at midnight, at month end)?
- Notifications: who is told (email, push, in-app), and can they opt out?

## Security
- New input from users or third parties: validated where?
- Secrets, tokens, payment data: stored or logged anywhere?
- Uploads: type and size checks, scanning, private storage?
- Audit trail needed for this action?

## UX, i18n and accessibility
- Copy and error messages: who writes them? Translations / multiple languages / RTL?
- Dates, numbers, currency formatted for the user's locale and time zone?
- Keyboard use, labels, focus, contrast (react-next-standards section 8)?
- Mobile/responsive layout?

## Operations
- Feature flag needed for gradual rollout or a quick off switch?
- New env vars or third-party keys? Who creates them per environment?
- What to log / alert on? How do we know in production that it works (metric, Sentry, analytics event)?
- Rollback: can we roll back the code without rolling back the data?

## Analytics and success
- Which event or metric shows the feature is used and working? Does the client want it tracked?
- Is there a measurable success criterion in the goal?
