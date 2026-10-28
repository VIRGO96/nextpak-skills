# Session handoff template

Save as `sessions/YYYY-MM-DD-topic.md` (e.g. `2026-10-27-stripe-webhooks.md`). If the name is
taken, add `-2`. The date prefix keeps files in order; the newest is the last one in `ls sessions/`.
Write for someone (human or agent) with no memory of this session. Under ~40 lines.

```markdown
# YYYY-MM-DD - <topic>

Ticket / branch: <id or link> / `<branch>`

## Done
- <What changed, with file paths or PR link>

## Pending
- <Started but not finished, and where it stopped>

## Known issues
- <Bugs, flaky tests, shortcuts taken, with file paths>

## Next steps
1. <The very next concrete action>

## Docs touched
- <docs/domains/x.md, docs/decisions/NNNN-y.md, AGENTS.md - or "none">

## Verification
- `<test command>` -> <N passed / N failed> (paste the summary line, not a claim)
```
