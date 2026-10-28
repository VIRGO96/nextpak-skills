# Writing skills

How the NextPak team writes, tests and ships agent skills. It combines the Agent Skills
specification, Anthropic's authoring guide, Google's Antigravity docsand what we learned building the skills in this repo.

The `skill-authoring` skill gives an agent the same process, so you can ask: "write a skill for
our deploy process" and it follows this guide.

## Contents

1. Skill, rule, doc or script?
2. Anatomy of a skill
3. Frontmatter
4. Writing the description (this decides if the skill is ever used)
5. Writing the body
6. Making rules stick
7. Testing a skill
8. Shipping: review, versioning, third-party skills
9. Checklist
10. Sources

## 1. Skill, rule, doc or script?

Not everything should be a skill. Pick the lightest thing that works.

| Put it in... | When | Example |
|---|---|---|
| **AGENTS.md** (always loaded) | A short rule that applies to almost every task | "Unclear requests: ask before editing"; the "Team skills" table |
| **A skill** (loaded when relevant) | A procedure, standard or checklist needed only for some tasks, too long for AGENTS.md | `pr-ready`, `node-express-standards` |
| **A reference file inside a skill** | Detail the agent needs only sometimes: examples, templates, long checklists | `testing-qa/references/playwright.md` |
| **A script inside a skill** | A step that must be exact every time (checks, validation, file generation) | `pr-ready/scripts/check-diff.mjs` |
| **docs/** (humans) | Explanations for people: why, how to install, how to contribute | this file |

Write a skill only for a real, repeated failure. If you can't point at a task where an agent got
it wrong, you don't need the skill yet.

What we learned: skills alone did **not** trigger for coding tasks (12/29 in our trigger test).
Each project's AGENTS.md needs the "Team skills" table that points tasks to skills. A new skill
is not done until its row is in the template (`docs-keeper/references/agents-md-template.md`).

## 2. Anatomy of a skill

```
skill-name/
  SKILL.md        required: frontmatter + instructions (loaded when the skill triggers)
  references/     optional: detail loaded only when needed (examples.md, checklist.md, ...)
  scripts/        optional: code the agent runs instead of writing it
  assets/         optional: templates, schemas, static files
```

- The folder name **is** the skill name, in kebab-case. The file is exactly `SKILL.md`.
- No `README.md` inside a skill folder. Everything the agent needs is in `SKILL.md` or linked from it.
- Links from `SKILL.md` go **one level deep**: `SKILL.md` links to `references/x.md`; reference
  files don't send the agent on to other reference files (agents may only skim nested files).
- A reference file over ~100 lines starts with a short table of contents.
- Paths use forward slashes (`references/examples.md`), even on Windows.

How agents load it (progressive disclosure):

| Level | What | Cost |
|---|---|---|
| 1. Metadata | `name` + `description` of every installed skill | ~100 tokens per skill, always loaded |
| 2. Instructions | The `SKILL.md` body | Loaded when the skill triggers; keep under 500 lines (~5k tokens) |
| 3. Resources | `references/`, `scripts/`, `assets/` | Only when read or run |

Where skills are installed in a project:

| Tool | Project folder |
|---|---|
| Claude Code | `.claude/skills/<skill-name>/` |
| Google Antigravity | `.agents/skills/<skill-name>/` (older `.agent/skills/` still read) |
| OpenAI Codex | `.agents/skills/<skill-name>/` |

## 3. Frontmatter

```yaml
---
name: release-checklist
description: Use when ... (see section 4)
metadata:
  author: NextPak AI Team
  version: 0.1.0
---
```

Rules from the specification (the validator checks them):

- `name`: 1-64 characters, lowercase letters, digits and single hyphens; doesn't start or end
  with a hyphen; **matches the folder name**; doesn't contain `anthropic` or `claude`.
- `description`: 1-1024 characters, no XML tags (`<` `>`).
- Optional fields: `license`, `compatibility` (max 500 characters, only when the skill needs a
  specific tool or environment), `metadata` (string keys and values), `allowed-tools`
  (experimental, support varies by tool; we don't use it).

Team conventions:

- `metadata.author: NextPak AI Team` and `metadata.version` (see section 8).
- Keep the description on one line. Never write ` #` inside it: in YAML that starts a comment
  and silently cuts the description (we hit this with "review PR #42").
- Check for name clashes with built-in skills. Claude Code ships a `code-review` skill, so ours
  is `review-pr`.

## 4. Writing the description

The description is the only part the agent sees before deciding to load the skill. A great skill
with a weak description is never used.

Our formula (one line):

```
Use when <situations and example requests, including Roman Urdu phrasings>. <What the skill
does, in one or two sentences>. Keywords - <terms people use>. Not for <near misses> (use <other skill>).
```

Real example (`release-checklist`, shortened):

```yaml
description: Use when a PR is approved or merged and the change is about to go out, or has just gone out - the user says deploy to staging, release this, ship it, push to production, rollback, hotfix. Covers the CI gate, pre-deploy checklist, smoke tests, error monitoring and rollback. Any stack. Not for preparing or reviewing the PR itself - use pr-ready or review-pr for that.
```

Rules:

- **Start with the trigger, "Use when ...".** Describe the situation and the words people
  actually type, not the skill's internals.
- **Include the phrases our team uses.** The trigger test runs English and Roman Urdu prompts
  ("prompt behtar karo", "production pe push karna hai").
- **Say what it does in one or two sentences, but don't put the workflow in the description.**
  When a description summarizes the steps, agents tend to follow that summary and skip the body.
  A list of topics is fine (it works as keywords: "covers migrations, env vars, rollback"); an
  ordered sequence of steps is not ("first checks X, then Y, then Z").
- **Add Roman Urdu phrasings when the trigger test shows the skill misses them.** With the
  AGENTS.md table in place, our Roman Urdu prompts loaded the right skills without them.
- **Third person or imperative.** Never "I can help you..." or "You can use this to...".
- **Add a "Not for ..." line** naming the nearest other skill. It stops two skills fighting
  over the same prompt.
- **Specific beats short.** "Helps with deployments" never triggers reliably.

## 5. Writing the body

Standard section order for team skills:

```markdown
# <Title>
<One or two lines: what this skill is for.>

## CRITICAL rules          3-6 rules that must never be broken, each with the reason
## <Process / steps>       numbered steps or a checklist the agent copies and ticks
## <Standards / patterns>  tables, short examples, templates
## Definition of done      checklist the agent verifies before saying it's finished
## Red flags               mistakes and excuses that mean "stop and fix"
## References              links to references/ files, one line each
```

Guidelines:

- **Be concise.** The agent is already a capable developer. Only write what it doesn't know or
  gets wrong: our conventions, our tools, the mistakes we saw. Cut every paragraph that explains
  general knowledge. Aim for 150-250 lines; the hard limit is 500.
- **Match freedom to risk.** Open tasks (review, design) get guidelines. Fragile tasks
  (migrations, deploys, board updates) get exact steps or a script: "Run exactly this command".
- **One default, not a menu.** "Use Zod 4 `z.strictObject`" beats "you can use Zod, Joi or
  Yup". Give an escape hatch only when it's really needed.
- **Concrete examples over descriptions.** A 10-line code example teaches more than a paragraph.
  Examples must be correct and match our standards: agents copy them, mistakes included.
- **One term per thing.** Don't mix "card", "ticket" and "task" for the same object without saying so.
- **No dates or "new since" notes** that will go stale. Put deprecated ways in a short
  "Old patterns" note if they're still needed.
- **Work in every tool.** Name tools in a way all agents understand. For MCP tools, give the
  plain tool name and note the prefix (Claude Code: `mcp__next-sprint__update_task`;
  Antigravity: `update_task`).
- **Scripts:** say whether the agent should **run** the script or **read** it. Scripts handle
  their own errors with clear messages and explain any constant ("400 lines: our PR size limit").
- **No secrets, customer data or internal URLs with credentials** anywhere in a skill.
- **English only** in skills, references and docs.

## 6. Making rules stick

Agents under pressure look for reasons to skip a rule ("it's a small change", "I'll test after").
What works, from testing our skills:

- **Give the reason** with the rule: "Never move the card to QA yourself - QA owns that stage."
  Agents follow rules they understand and apply them to cases you didn't list.
- **Close the loophole you actually saw.** When a test run breaks a rule, quote the excuse in
  the Red flags list and answer it. Example from `node-express-standards` v0.2: the agent wrote
  tests but never ran them failing first, so the skill now says "paste the failing output".
- **Make the check visible.** "Paste the command output" can be verified; "make sure tests pass" can't.
- **Use CRITICAL / MUST sparingly** - for the few rules where breaking them causes real damage.
  If everything is critical, nothing is.
- **Scope rules prevent the most damage.** Our first A/B run broke an existing API response
  while adding a feature. "Stay inside the ticket's scope" fixed it.

## 7. Testing a skill

Skills are tested like code: **no skill without a failing test first.** Details and commands:
[testing-skills.md](testing-skills.md).

1. **RED - baseline without the skill.** Run 3 or more realistic tasks with no skill. Write down
   exactly what the agent did wrong. These failures are the skill's requirements.
2. **GREEN - minimal skill.** Write just enough to fix those failures. Run the same tasks with
   the skill. Each failure must be gone.
3. **REFACTOR - close loopholes.** Look for new ways the agent dodges a rule; add them to Red
   flags; re-test. Also cut anything the agent didn't need.

Three kinds of test:

| Test | Question | Pass when |
|---|---|---|
| **Trigger test** | Does it load for the right prompts, and only those? | Loads for every "should" prompt (English and Roman Urdu), none of the "should not" prompts, and the whole suite still passes |
| **Behavior test** | Does the agent do the job better with it? | Same task with and without the skill, checked by hidden tests or a written rubric, e.g. `node-express-standards`: 18/23 without, 23/23 with |
| **Regression** | Did changing this skill break another one? | Full trigger suite passes after any description change |

Test with the models the team uses (Sonnet and Opus in Claude Code, Gemini in Antigravity).
Weaker models may need more explicit steps; stronger ones shouldn't get over-explained text.

## 8. Shipping

- **One skill change per PR.** The PR description includes the RED failures, the GREEN results
  and the trigger test total.
- **Run `node tools/validate-skills.mjs`** before opening the PR. It must report 0 errors.
- **Version** with `metadata.version` (semantic versioning):
  - patch (0.2.0 -> 0.2.1): wording, typo, clearer example, no behavior change
  - minor (0.2.0 -> 0.3.0): new rule, step, section or reference file
  - major (0.x -> 1.0, 1.x -> 2.0): a rule removed or reversed, a rename, or the skill now does a different job
- **Update the README skills table** and, for a new skill, the "Team skills" table in the
  AGENTS.md template.
- **Third-party skills** go unmodified in `third-party/<source>/` with the LICENSE and a
  `SOURCE.md` naming the commit. To change one, copy it into a team skill with credit; never
  edit the third-party copy.
- **Reviewer** re-runs the validator and the trigger test, and reads the skill as the agent
  would: is any line unclear, contradictory or unnecessary?

## 9. Checklist

Use [skill-authoring/references/review-checklist.md](../skill-authoring/references/review-checklist.md)
in every skill PR. It is kept in one place so the guide, the skill and reviewers never drift
apart. Items the validator checks are marked (auto).

## 10. Sources

- Agent Skills specification: https://agentskills.io/specification
- Anthropic, Skill authoring best practices:
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Anthropic, The Complete Guide to Building Skills for Claude (PDF):
  https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf
- Anthropic `skill-creator` skill: https://github.com/anthropics/skills
- obra/superpowers `writing-skills` (TDD for skills, MIT):
  https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md
- Google, Authoring Antigravity Skills:
  https://codelabs.developers.google.com/getting-started-with-antigravity-skills
- OpenAI, Codex Agent Skills: https://developers.openai.com/codex/skills
