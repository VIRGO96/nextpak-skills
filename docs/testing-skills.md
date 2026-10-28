# Testing skills

How to run the three tests from [writing-skills.md](writing-skills.md) section 7. Run them on
every skill change before opening the PR.

## 1. Validator (seconds, free)

```bash
node tools/validate-skills.mjs
```

Checks every skill against the Agent Skills spec and our conventions: name and folder, description
length and characters, metadata, size, required sections, links, reference depth and contents.
Must end with `0 errors`. Requires Node 20.11 or newer.

## 2. Trigger test (about 10 minutes, uses llm tokens)

Does each prompt load the expected skill, and do near-miss prompts load nothing?

```bash
bash tools/trigger-test/run.sh                    # all prompts in tools/trigger-test/prompts.tsv
bash tools/trigger-test/run.sh my-prompts.tsv     # only your prompts while iterating
PARALLEL=2 MODEL=opus bash tools/trigger-test/run.sh
```

How it works:

- `tools/trigger-test/fixtures/` holds three small sample apps (`express`, `fastapi`, `next`).
  Each has a `.stack-skill` file naming its stack skill.
- For each fixture the script builds a fresh copy under the output folder with every skill in
  `.claude/skills/` and a `CLAUDE.md` generated from the AGENTS.md template, so the test always
  uses the current skills and the current "Team skills" table.
- Each prompt runs headless (`claude -p`, 3 turns, project settings only) and the report checks
  which skills the agent loaded. Results land in `tools/trigger-test/out/<timestamp>/`
  (git-ignored): one `.jsonl` log per prompt and `report.txt`.

Prompt file format (tab-separated):

```
id	dir	expected	prompt
N1	express	node-express-standards	Add a DELETE /api/v1/orders/:id endpoint so users can cancel pending orders
A1	express	ai-dlc|nextsprint-workflow	start card SHOP-42 Update profile from NextSprint
X1	express	none	what's the difference between PUT and PATCH? one line
```

- `expected`: one skill, several separated by `|` (any one passes), or `none`.
- Add 3-5 "should load" prompts per skill, in English and Roman Urdu, written the way people
  really type, plus 1-2 "should not" prompts. Trivial prompts ("read file X") are useless:
  agents don't need a skill for them.

When a prompt fails, read its `.jsonl` log: did the agent load a different skill (descriptions
overlap: add a "Not for" line), no skill (missing phrases in the description or no row in the
AGENTS.md table), or run out of turns?

Last full run: 31/31 (2026-10-28).

## 3. Behavior test (A/B)

Does the agent do the job better with the skill? There's no script for this yet; it needs a
task-specific check.

1. Pick a realistic task from a real card and a fixture or copy of a real repo.
2. Write the check before running anything: hidden tests the agent never sees (best), or a
   rubric of 5-10 yes/no items ("ownership check present", "failing test output pasted").
3. Run the task twice in fresh copies: without the skill, then with it. Same model, same prompt.
4. Score both runs and keep the logs. Example: `node-express-standards` scored 18/23 hidden QA
   tests without the skill and 23/23 with it.
5. A failure with the skill means the skill is unclear or missing a rule: fix the skill and
   re-run, never loosen the check.

Run behavior tests with every model the team uses (Sonnet and Opus in Claude Code, Gemini in
Antigravity). Antigravity has no headless mode we rely on yet, so run its prompts by hand in
the IDE and note the result.

## Recording results

Put the numbers in the PR description: RED failures, GREEN result, trigger test total, and
validator output. Update the "Test results" table in the README when a number changes.
