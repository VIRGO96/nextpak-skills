# Domain doc template

Save as `docs/domains/<area>.md` (kebab-case, e.g. `subscription-flow.md`). One file per major
area. Facts from code or the user only; unknowns as `TODO(question): ...`. Aim for under ~150 lines.
Link to code instead of pasting it.

```markdown
# <Area name>

Last updated: YYYY-MM-DD (<short commit hash the doc was checked against>)

## What it does
<2-4 sentences in business terms: who uses it and why.>

## Code
<!-- docs-keeper maps changed files to this doc using these paths. Keep them exact. -->
- `<path/or/glob/**>` - <role>

## Key concepts
- **<Term>**: <meaning in this project>. <!-- multi-repo: put shared terms in glossary.md -->

## How it works
1. <Main flow, step by step: trigger -> checks -> writes -> side effects>

## Rules and edge cases
- <Business rule the code enforces> (`<file:function>`)

## Data
- <Table/collection/model> - <key fields that matter>

## API / events
- `<METHOD /path>` or `<event name>` - <purpose>. <!-- multi-repo: link openapi.yaml instead -->

## Known issues / gotchas
- <Thing that has bitten someone before>

## Related
- Decisions: [ADR-NNNN](../decisions/NNNN-title.md)
- Other domains: [<area>](<area>.md)
```
