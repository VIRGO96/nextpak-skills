# Skill template

Copy everything inside the fence into `<skill-name>/SKILL.md`, replace each `<...>`, and delete
any section that doesn't apply. Keep the description on one line.

```markdown
---
name: <skill-name>
description: Use when <situations> - <phrases people type, e.g. deploy to staging, ship it>. <What the skill does in one or two sentences>. Keywords - <terms>. Not for <near misses> (use <other-skill>).
metadata:
  author: NextPak AI Team
  version: 0.1.0
---

# <Title>

<One or two lines: what this skill is for and when it ends.>

## CRITICAL rules

- **<Rule>.** <Reason: what goes wrong without it.>
- **<Rule>.** <Reason.>

## <Process name>

1. <Step: an action the agent can check>
2. <Step>
3. <Step>

## <Standards / patterns>

| Situation | Do this |
|---|---|
| <case> | <default> |

<Short, correct example in the team's stack.>

## Definition of done

- [ ] <Verifiable item, e.g. "test command output pasted">
- [ ] <Verifiable item>

## Red flags: stop and fix

- <Mistake or excuse seen in testing>
- <Mistake or excuse>

## References

[<Topic>](references/<file>.md): <one line on when to read it>.
```

Optional folders next to `SKILL.md`:

- `references/<topic>.md` - detail loaded only when needed. Over 100 lines: start with
  `## Contents`.
- `scripts/<name>.mjs|.py|.sh` - the agent runs it; SKILL.md says "Run `node scripts/x.mjs`".
  Handle errors with clear messages; explain any constant.
- `assets/` - templates and static files the agent copies.

Never add a `README.md` inside a skill folder.
