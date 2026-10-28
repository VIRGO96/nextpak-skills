# The AI-DLC flow

How a card moves from the board to production, and which skill the agent uses at each step.
GitHub, VS Code (with a Mermaid preview extension) and Antigravity render these diagrams; the
source is plain text, so update it in the same PR when a skill's role changes.

## Contents

- 1. The big picture
- 2. How the agent picks up the right skill
- 3. One card, start to finish
- 4. The bug path
- 5. Size decides how heavy the process is
- 6. The card on the NextSprint board
- 7. Vague prompts
- 8. Cheat sheet

## 1. The big picture

Every card goes round the same loop. `ai-dlc` is the map; the other skills do the work at each
step. Close-out feeds lessons back into AGENTS.md and the skills, so the next card starts better.

```mermaid
flowchart TD
    card(["Card on NextSprint"]) --> p0
    p0["0 Ready check<br/>ai-dlc + docs-keeper"] --> p1
    p1["1 Intake and plan<br/>ai-dlc"] --> p2
    p2["2 Build, tests first<br/>stack skill + testing-qa"] --> p3
    p3["3 Verify<br/>testing-qa + verification-before-completion"] --> p4
    p4["4-5 PR and review<br/>pr-ready, review-pr"] --> p6
    p6["6 Deploy<br/>release-checklist"] --> p7
    p7["7 Close-out<br/>docs-keeper"] --> done(["Card done"])
    p7 -. "lessons become rules" .-> rules[("AGENTS.md and skills")]
    rules -. "next card" .-> p0
    board{{"nextsprint-workflow keeps the card updated at every step"}}
```

## 2. How the agent picks up the right skill

Three layers. The first is always there; the others load only when needed.

```mermaid
flowchart TD
    dev(["Developer prompt"]) --> agents["AGENTS.md, read on every prompt<br/>Team skills table + Unclear requests rule"]
    agents --> clear{"Clear what, where<br/>and how to check?"}
    clear -- "no" --> ask["Agent shows what it found<br/>and asks up to 3 questions with defaults"]
    ask --> dev
    clear -- "yes" --> match["Table and skill descriptions<br/>pick the skills for the task"]
    match --> load["Skill loads: SKILL.md,<br/>then references only if needed"]
    load --> work["Agent does the work"]
    dev -. "improve my prompt: ..." .-> pe["prompt-engineering<br/>returns a polished prompt"]
    pe -. "developer runs it" .-> dev
```

## 3. One card, start to finish

What happens between the developer, the agent, the board and the reviewer on a normal feature.

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant Agent
    participant Board as NextSprint
    actor Rev as Reviewer
    Dev->>Agent: start card SHOP-42
    Agent->>Board: read card (ai-dlc, nextsprint-workflow)
    Agent->>Agent: ready check, size, acceptance criteria
    Agent->>Dev: plan and open questions
    Dev->>Agent: OK
    Agent->>Board: move to In progress, add checklist, post plan
    Agent->>Agent: tests first, then code (stack skill + testing-qa)
    Agent->>Agent: run everything, paste output (verification-before-completion)
    Agent->>Board: tick checklist items to dev done
    Agent->>Agent: scope, secrets, self-review, open PR (pr-ready)
    Agent->>Board: move to Dev done, link PR, post test evidence
    Rev->>Agent: review PR 42 (review-pr)
    Agent->>Rev: findings with file:line and severity
    Dev->>Agent: deploy to staging (release-checklist)
    Agent->>Dev: smoke test results, production needs your OK
    Agent->>Agent: docs, decisions, handoff (docs-keeper)
```

## 4. The bug path

No fix without a failing test and a root cause.

```mermaid
flowchart TD
    bug(["Bug report"]) --> rep["Reproduce<br/>exact steps and data"]
    rep --> red["Failing test first<br/>testing-qa"]
    red --> cause["Root cause<br/>systematic-debugging"]
    cause --> fix["Smallest fix of the cause<br/>stack skill"]
    fix --> green["New test green,<br/>full suite green<br/>verification-before-completion"]
    green --> pr(["PR as usual<br/>pr-ready"])
    rep -- "can't reproduce" --> data["Gather logs and request id,<br/>ask, don't fix blind"]
    data --> rep
```

## 5. Size decides how heavy the process is

Small tasks stay light; risky areas always get the full process, however few lines they touch.

```mermaid
flowchart TD
    task(["Card"]) --> risky{"Auth, payments, permissions,<br/>deleting data, migrations,<br/>public API, multi-repo, over 2 days?"}
    risky -- "yes" --> large["LARGE<br/>spec file approved before code<br/>full edge-case testing, ADR,<br/>full release checklist"]
    risky -- "no" --> hour{"About 1 hour,<br/>one file area?"}
    hour -- "yes" --> small["SMALL<br/>2-5 acceptance criteria on the card<br/>tests first, normal PR"]
    hour -- "no" --> normal["NORMAL<br/>short spec, developer OKs the criteria<br/>tests first, PR, review"]
```

## 6. The card on the NextSprint board

List names differ per board; `nextsprint-workflow` maps them by meaning. Developers' agents stop
at Dev done. Moving into Done always ticks the complete checkbox in the same call.

```mermaid
stateDiagram-v2
    [*] --> Backlog
    Backlog --> Todo: lead plans the sprint
    Todo --> InProgress: agent, on start (automatic)
    InProgress --> Blocked: agent, with reason (automatic)
    Blocked --> InProgress: agent, when unblocked
    InProgress --> DevDone: agent, PR open (automatic)
    DevDone --> QA: QA or lead
    QA --> InProgress: QA reopens, complete box cleared
    QA --> Done: QA or lead, complete box ticked
    Done --> [*]
    note right of DevDone
        Agent never moves past Dev done
        without the developer's OK
    end note
```

## 7. Vague prompts

The "Unclear requests" rule in AGENTS.md runs on every prompt in every tool.

```mermaid
flowchart LR
    p1(["fix the bug in users"]) --> look["Agent reads the code"]
    look --> q["Found: users.ts has GET /me only<br/>1. What fails? default: ...<br/>2. Since when? default: ...<br/>3. How to check? default: npm test"]
    q --> a(["Developer: defaults"]) --> go["Agent works with the defaults"]
    p2(["Add GET /health in src/app.ts<br/>returning 200, with a test"]) --> direct["Clear: agent just does it"]
```

## 8. Cheat sheet

| You want to... | Say something like | Skill that loads |
|---|---|---|
| Start or continue a card | "start card SHOP-42", "pick my next task" | `ai-dlc` + `nextsprint-workflow` |
| Update the board | "I'm blocked on the API keys, update the card" | `nextsprint-workflow` |
| Build a backend feature | "add an endpoint to cancel orders" | `node-express-standards` or `fastapi-standards` |
| Build a page or component | "build a settings page" | `react-next-standards` |
| Write tests, check edge cases | "test the edge cases before QA" | `testing-qa` |
| Fix a bug or failing test | "this returns 500, fix it" | `systematic-debugging` |
| Confirm it's really done | "is it fixed? confirm everything passes" | `verification-before-completion` |
| Open a PR | "open a PR" | `pr-ready` |
| Review a teammate's PR | "review PR 42" | `review-pr` |
| Deploy or roll back | "deploy to staging", "rollback" | `release-checklist` |
| Docs, decisions, handoff | "log this decision", "write a handoff" | `docs-keeper` |
| Write a better prompt | "improve my prompt: ..." | `prompt-engineering` |
