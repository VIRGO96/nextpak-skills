# ADR template (MADR minimal, Nygard sections)

Save as `docs/decisions/NNNN-title-with-dashes.md`. `NNNN` = highest existing number + 1,
zero-padded (`0001`, `0002`...). Numbers are never reused. Keep it to one or two pages.

Never edit an accepted ADR's decision. To reverse it, write a new ADR and change the old one's
status to `superseded by ADR-NNNN`.

```markdown
---
status: accepted   # proposed | accepted | rejected | deprecated | superseded by ADR-NNNN
date: YYYY-MM-DD
deciders: <roles or team, not personal names>
---

# NNNN. <Short title: the problem and the chosen solution>

## Context and problem statement
<The forces at play: what forced a choice, constraints, what breaks if we do nothing.>

## Considered options
1. <Option A>
2. <Option B>

## Decision outcome
Chosen: **<Option>**, because <reason tied to the context>.

### Consequences
- Good: <...>
- Bad / trade-off: <...>
- Follow-up: <work this creates, or "none">

## More information
<Links: ticket, PR, domain doc, related ADRs. Optional.>
```

Sources: https://adr.github.io/madr/ , https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
