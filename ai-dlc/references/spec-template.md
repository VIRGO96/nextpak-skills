# Spec templates

Pick the form by type and size. Write in plain language a developer, QA and the client can all
read. The spec says **what** and **why**; the plan says **how**. Don't put code in the spec.

Rules for every form:
- Each acceptance criterion is **testable**: someone can say pass or fail without asking you.
  Use "Given / When / Then" or "When <event>, the system shall <response>".
- Unknowns: `[NEEDS CLARIFICATION: <exact question>]`. The spec isn't done while one is left.
- Assumptions you make: list them under "Assumptions" so the developer can veto them.
- Out of scope is required. It stops scope creep in Build and in review.

## Small (card comment, 3-8 lines)

```
Goal: <one sentence>
AC:
1. Given <state>, when <action>, then <result>
2. ...
Out of scope: <one line>
```

## Normal (card description or comment)

```
Goal: <who needs what, and why - one or two sentences>

Behavior:
- <what the user sees/does, step by step, incl. empty, loading and error states>

Acceptance criteria:
1. Given ..., when ..., then ...
2. ...

Out of scope:
- ...

Domain docs: docs/domains/<area>.md
Risks / open questions: ... | [NEEDS CLARIFICATION: ...]
```

## Large (file: docs/specs/YYYY-MM-DD-<card-id>-<slug>.md)

```markdown
# <Card id> - <title>

Card: <link> | Size: Large | Repos: backend, frontend, ... | Status: draft / approved (<date>, <who>)

## Goal
Who needs this, what problem it solves, how we will know it worked (a measurable outcome if one exists).

## User-visible behavior
Main flow step by step per role. Then: empty state, loading, errors, permissions denied.

## Acceptance criteria
1. Given <state>, when <action>, then <result>.
2. When <event>, the system shall <response>.
(Each one maps to at least one test. Number them; tests and PR reference the numbers.)

## Out of scope
- ...

## Data and API
- Data model changes, migrations (on existing rows? backfill? reversible?)
- API contract changes (link to openapi.yaml diff; additive or breaking?)

## Affected domain docs
- docs/domains/<area>.md (read before planning; update at close-out)

## Skills and MCPs needed
- Stack: node-express-standards / fastapi-standards / react-next-standards
- Tools: Playwright MCP, Stripe, Sentry, DB ... (installed? yes/no)

## Risks
- <risk> -> <mitigation> (feature flag, rollback plan, extra tests)

## Assumptions
- ...

## Open questions
- [NEEDS CLARIFICATION: ...]

## Plan (after spec approval)
1. <ordered step, repo, what gets tested>
2. ...
Migrations / env vars / feature flags / deploy order: ...
```

## Bug form (card comment, or file for Large bugs)

Borrowed from Kiro bugfix specs: say what must **not** change, so the fix doesn't break neighbours.

```
Current behavior: <what happens, exact steps, environment, request id / log line>
Expected behavior: <what should happen>
Unchanged behavior: <related things that must keep working>
Repro test: <test name / file> - RED output pasted
Root cause: <one sentence, after systematic-debugging>
Fix: <what changed and why it addresses the cause>
```

## Spike form (card comment)

```
Question: <what we need to decide>
Time-box: <hours agreed with the developer>
Options tried: <option - result - evidence (link, command output, prototype branch)>
Recommendation: <one option + why + follow-up cards to create>
```
