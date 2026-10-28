# Stage mapping: board lists to workflow stages

Every NextSprint board names its lists differently. Always call `list_board_lists` for the card's
board, then map each list to one of the stages below **by meaning and by position** (lists come back
in board order, left to right). Never hardcode a list name.

## Stages

| Stage | Meaning | List names that usually mean it | Who moves cards **into** it |
|---|---|---|---|
| backlog | Not planned for this sprint yet | backlog, icebox, later, ideas, parking lot | Lead / PM |
| ready | Planned for the sprint, not started | todo, to do, ready, selected, sprint backlog, next, up next | Lead / PM |
| bug inbox | Bugs waiting to be picked up | QA reported bugs, reported bugs, bugs, issues | QA / lead |
| in-progress | Developer is working on it | doing, in progress, wip, working, development, in dev, active | **Developer (automatic)** |
| blocked | Work cannot continue | blockage, blocked, on hold, waiting, impediment, stuck | **Developer (automatic)** |
| dev-done | Code finished, PR open, waiting for QA | dev done, ready for QA, code review, in review, PR, completed (only when a QA/tested list comes after it) | **Developer (automatic)** |
| QA | Being tested | under testing, testing, in testing, QA, in QA | QA (developer only with OK) |
| QA passed | Testing finished and passed | tested, QA passed, verified, QA done | QA |
| client-ready | Waiting for client review / UAT | ready for client, client review, UAT, staging, demo | Lead |
| done | Finished and accepted | done, completed (when it is the last stage), closed, released, deployed, live | Lead / QA (developer only with OK). Always moved together with `isComplete: true` |

## Boards seen so far

| Board lists (in order) | Mapping |
|---|---|
| backlog, todo, doing, completed, tested, blockage | backlog, ready, in-progress, **dev-done** (completed comes before tested), QA passed, blocked |
| backlog, todo, QA reported bugs, in progress, dev done, under testing, ready for client | backlog, ready, bug inbox, in-progress, dev-done, QA, client-ready (no blocked list, no done list) |
| To Do, Doing, Completed | ready, in-progress, done (no QA stage, no blocked list, no dev-done list) |

## Ambiguity rules

1. **"completed" / "done"** is dev-done when a QA or tested list comes **after** it; it is the done
   stage when it is the last list or nothing test-like follows it.
2. **No blocked list**: leave the card where it is and rely on the blocked comment (plus `on_hold` on the
   blocked checklist items).
3. **No dev-done list but a QA list exists**: do not move to QA on your own. Ask: "This board has no
   dev-done list. Move to `<QA list>` now, or leave it in `<in-progress list>` with the PR comment?"
4. **No QA stage at all** (To Do / Doing / Completed): after the PR, leave the card in progress and ask
   whether to move it to the done list now or after merge.
5. **Two lists fit one stage** (e.g. "blocked" and "on hold"), or a list name you cannot place: ask once.
6. Ask **once per board per session**, remember the answer, and offer to save it in the project's
   `AGENTS.md` so the next session (and other developers' agents) do not ask again.
7. Never create, rename or reorder lists to make the mapping fit. That is board admin work.

## AGENTS.md snippet (offer to add it; the developer decides)

```markdown
## NextSprint

Board: <board title>
Stage mapping (list title -> stage):
- todo -> ready
- doing -> in-progress
- blockage -> blocked
- completed -> dev-done (QA moves cards to "tested")
- tested -> QA passed
Developers stop at dev-done. Bug label: BUG. New bug cards go to: backlog
```

List titles and IDs are not secrets, but keep only the mapping here: no tokens, no member emails.
