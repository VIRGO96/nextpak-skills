# Checklist templates and item statuses

Create a checklist only when the card has none. Use **one** `add_checklist` call with every item in
`items`. Title it `Acceptance Criteria`. Items must be short, testable outcomes (what a user or QA can
check), not implementation steps. Aim for 3-10 items.

## How to turn acceptance criteria into items

1. Use the card's own criteria first (an "Acceptance criteria" section, a bullet list, "should ..."
   sentences). Keep the author's wording; shorten only.
2. If the card has no criteria, derive them from the agreed spec (PLAN phase) and **show them to the
   developer before creating** the checklist, because they are your words, not the card author's.
3. Leave out anything listed as out of scope.
4. Do not add generic items ("write code", "code review") unless the team's board already uses them.

## Feature card

```json
{
  "taskId": "<task id>",
  "title": "Acceptance Criteria",
  "items": [
    "User can <do the main action> from <screen/endpoint>",
    "Validation: <invalid input> shows <message / 400 error>",
    "Permissions: only <role/owner> can <action>; others get <403 / hidden button>",
    "Empty / error states handled: <list>",
    "Automated tests cover the criteria above",
    "Works on <mobile and desktop / supported browsers> (UI cards only)"
  ]
}
```

## Bug card

```json
{
  "taskId": "<task id>",
  "title": "Acceptance Criteria",
  "items": [
    "Bug reproduced (steps confirmed on <environment>)",
    "Root cause identified and noted in a comment",
    "Failing test added that reproduces the bug",
    "Fix makes the test pass; expected result now happens",
    "Related flows re-checked: <list>"
  ]
}
```

A bug card is ready to fix only when it has: steps to reproduce, expected result, actual result,
environment (app/version/browser/device) and how often it happens. If any is missing, comment with the
"Need reproduction info" template first.

## Item statuses: who sets what

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Not started (default) | anyone |
| `in_progress` | Working on it now | **developer (automatic)** |
| `dev_done` | Implemented and its tests pass in this session | **developer (automatic)** |
| `discussion` | Waiting for an answer / decision | **developer (automatic)** |
| `on_hold` | Blocked | **developer (automatic)** |
| `new_requirement` | Added after work started | **developer (automatic)**, say who asked |
| `reopened` | QA sent it back | QA; developer sets it back to `in_progress` when rework starts |
| `delayed` | Will miss the plan / sprint | developer with OK (it is a schedule signal for the lead) |
| `qa` | In testing | QA (developer only with OK) |
| `approved` | QA/lead accepted it | QA / lead |
| `completed` | Done and checked | QA / lead; developer only on boards without QA, with OK |
| `pending_client`, `client_approval`, `client_review` | Waiting on the client | lead |
| `backlog` | Moved out of this sprint | lead |
| `ignored` | Will not be done | lead, or developer with explicit OK |

Rules:
- Only `completed` checks an item. `update_task` with `isComplete: true` is refused while any item is
  unfinished, so completion is a QA/lead step on boards with a QA stage.
- Update an item when its state really changes, not on every commit.
- Item assignees must already be on the card (assignees or team leads); do not add people to make an
  assignment work.
