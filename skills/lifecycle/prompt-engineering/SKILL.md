---
name: prompt-engineering
description: Use when a developer wants help writing or improving a prompt for a coding agent - improve my prompt, polish this prompt, rewrite this prompt, make this prompt better, how should I ask the agent to do X, write a prompt for this task, prompt behtar karo, prompt theek kar do. Turns a rough request into a clear, checkable prompt using facts from the repo, and shows the developer what was missing so they learn. Works for Claude Code and Antigravity (Gemini). Keywords - prompt engineering, prompt template, few-shot, vague request, acceptance criteria. Not for doing the task itself (run the polished prompt after the developer approves it) or for system prompts inside product code.
metadata:
  author: NextPak AI Team
  version: 0.2.2
---

# Prompt engineering for coding agents

The developer gives you a rough prompt. You return a better prompt, not the finished work.

## CRITICAL rules

- **Don't run the task.** Your output is the polished prompt plus questions. No code edits,
  no commands that change anything. Run it only after the developer says so.
- **Never invent requirements.** Facts you find in the repo (file paths, routes, test
  command, existing patterns) go in. Anything about intent or behavior that the code can't
  answer becomes a question. A guessed requirement written into a prompt is worse than none.
- **At most 3 questions**, each with a suggested default answer so the developer can just
  reply "defaults". Defaults follow the team skills, not your own taste: open the stack
  skill when a default touches status codes, validation or auth.
- **Don't bloat a good prompt.** If the draft already names the file and the exact behavior,
  it is a small task: keep the draft's own form (a sentence or a short paragraph) and add at
  most two sentences, for example the test command or a conflict you found. No headings, no
  template.

## What a good coding prompt contains

Research on real developer prompts (Google, 2025) found the same five things missing again
and again; filling them from the code improved edit correctness by 27%. Anthropic and Google
both rank a way to verify the work as the highest-leverage addition.

| Part | Question it answers | Weak | Strong |
|---|---|---|---|
| **Goal** | What should be true afterwards, and why? | "fix login" | "Users with a valid password get 401 on `POST /api/v1/auth/login` since yesterday's deploy" |
| **Scope** | Where? What is off limits? | (none) | "`src/routes/auth.ts` and its tests only; don't change the response shape" |
| **Specifics** | Exact inputs, outputs, edge cases | "add validation" | "`name` 1-80 chars, `phone` E.164, unknown fields rejected with 400" |
| **Context** | What the agent can't see | (none) | Error text, log line, card link, the pattern to copy (`see routes/users.ts`) |
| **Constraints** | Rules for how | (none) | "No new dependencies. Follow `node-express-standards`." |
| **Done-check** | How do we know it worked? | (none) | "Add a failing test first; `npm test` passes; paste the output" |

## Process

1. **Read the draft.** Name the task type: bug, feature, frontend, tests, refactor, or
   question/investigation. The examples file has one worked example per type.
2. **Look before asking.** Spend a few quick reads to fill gaps yourself: find the file or
   route the prompt means, the test command (`package.json`, `pyproject.toml`), a similar
   existing feature to copy, the matching team skill. Read-only.
3. **Check the six parts** against the table. Mark each: present, filled from repo, or
   missing (needs the developer).
4. **Write the polished prompt** using the template below. Same language the team works in
   (English); keep the developer's own words where they are clear.
5. **Reply in this shape:**

   ```
   What was missing: <one line per part you added or that still needs an answer>

   Questions (reply "defaults" to accept):
   1. <question> - default: <answer>

   Polished prompt:
   <the prompt>
   ```
   Then ask: "Run it now?" Stop there.

## Prompt template

Plain Markdown headings work the same in Claude Code and Antigravity. Drop a section that
doesn't apply rather than filling it with filler. Small tasks get two or three lines, not
the full template (see the "small task" example).

```markdown
## Task
<one or two sentences: the goal and why>

## Context
- Repo/area: <service, stack> - follow `<team skill>`
- Relevant code: <paths found in step 2>
- Evidence: <error message, log line, screenshot, card link - pasted, not described>

## Requirements
- <specific behavior, one per line, including edge cases and error responses>

## Constraints
- Scope: <files/areas>; don't change <X>
- <no new dependencies / keep API shape / etc.>

## Done when
- <test to write first, command to run, expected output>
- Paste the command output before saying it's done.
```

Use XML-style tags (`<context>`, `<error_log>`) only to wrap long pasted material such as
logs or a stack trace, so the agent can tell it apart from instructions.

## Roles and examples: what actually helps

- **Use a role when it changes the job.** A role that sets what to look for works well:
  "Act as a QA tester: try to break this form with edge cases", "Review this as the security
  reviewer: look for IDOR and missing auth", "Act as the product owner: list open questions
  before any code". Put it as the first line of the Task section.
- **Skip status-only personas.** "You are a world-class senior engineer" adds nothing:
  studies show expert personas don't improve, and can hurt, accuracy on coding tasks. For
  plain build tasks, describe the situation instead ("You're working in the orders service,
  Express 5, Zod, Vitest").
- **Examples beat descriptions.** When the output must follow a pattern (an error format, a
  test style, a component shape), point at one existing file to copy or paste a short
  example. Two or three examples if the pattern varies. Examples must match exactly what you
  want: the agent copies them, mistakes included.
- **Say what to do, not only what not to do.** "Return 404 when the order isn't the user's"
  beats "don't leak other users' orders".
- **Don't script the thinking.** Current models plan on their own; ask for a plan first
  ("propose a plan and wait for my OK") on Large tasks instead of writing step-by-step
  reasoning instructions.

## Definition of done

- [ ] Reply has "What was missing", questions (or "none needed") and the polished prompt
- [ ] Every path, route and command in the prompt was confirmed in the repo
- [ ] Nothing in the prompt is a requirement nobody stated and the code doesn't show
- [ ] At most 3 questions, each with a default that follows the team skills
- [ ] The prompt has a done-check; a small task stayed small
- [ ] No files changed; ended with "Run it now?"

## Red flags: stop and fix

- You started editing code or ran the task (you only write the prompt)
- The polished prompt contains a requirement nobody stated and the code doesn't show
- "You are an expert..." persona line (a role that changes the job is fine)
- More than 3 questions, or questions the repo could have answered
- A clear two-line prompt turned into a 40-line template
- No done-check in the final prompt
- A file path or command in the prompt that you didn't confirm exists

## References

[Worked examples](references/examples.md): bad to good, one per task type (bug, feature,
frontend, tests, refactor, investigation, QA role, small task). Sources: Google "Transform Code"
prompt study (arXiv 2504.20196), Anthropic prompting and Claude Code best-practices docs,
Google Gemini prompting strategies.
