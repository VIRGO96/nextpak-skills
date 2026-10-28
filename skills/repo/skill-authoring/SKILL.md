---
name: skill-authoring
description: Use when creating a new team skill or changing an existing one in the NextPak skills repo - write a skill for X, turn this process into a skill, make our checklist a skill, update the testing-qa skill, this skill doesn't trigger, fix this skill's description, review this skill, is this skill good, nayi skill bana do, skill review karo. Applies the team's skill format, description formula and test-first method so every skill follows the same pattern. Keywords - SKILL.md, agent skill, frontmatter, description, trigger test, skill template, references, validate-skills. Not for using an existing skill, writing a project's AGENTS.md (use docs-keeper) or writing a prompt (use prompt-engineering).
metadata:
  author: NextPak AI Team
  version: 0.1.0
---

# Skill authoring

Write and change team skills the same way every time: proven need, one format, tested before
it ships. The full guide for humans is `docs/writing-skills.md` in the nextpak-skills repo;
this skill is the working version of it.

## CRITICAL rules

- **No skill without a failing baseline.** Before writing, run 3+ realistic tasks without the
  skill and record what the agent got wrong. Those failures are the requirements. A skill
  written from imagination teaches the agent things it already does. If you can't run the
  baseline now (headless run, no time, the developer wants a draft first), still write the
  RED scenarios, and put "RED baseline: not run" as the **first** open item in your report.
  Never present a skill as tested when it wasn't.
- **Never ship untested changes.** Every change, including "just the description", re-runs the
  trigger test, because a description change can steal or lose prompts from other skills.
- **Follow the team pattern** (template in [references/skill-template.md](references/skill-template.md)).
  If a rule here and an existing skill disagree, the skill is out of date: fix it in its own PR.
- **Third-party skills stay unmodified** in `skills/third-party/<source>/` with LICENSE and SOURCE.md.
- **English only; no secrets, customer data or credentials** in any skill file.

## 1. Decide it should be a skill

| The content is... | Put it in |
|---|---|
| A short rule needed on almost every task | AGENTS.md template (`skills/lifecycle/docs-keeper/references/agents-md-template.md`) |
| A procedure or standard needed for some tasks | A skill |
| Detail needed only sometimes (examples, long checklists) | `references/` inside a skill |
| A step that must be exact (validation, generation) | `scripts/` inside a skill |
| An explanation for people | `docs/` |

Check the existing skills first (README table). Extending one beats adding a near-duplicate.

## 2. RED: baseline without the skill

1. Write 3+ scenarios from real work (a card, a PR, a bug), in a fixture repo from
   `tools/trigger-test/fixtures/` or a copy of a real repo. Include one tempting shortcut
   (time pressure, "small change").
2. Run them without the skill, in fresh sessions. Record the exact mistakes and the excuses the
   agent gave, word for word.
3. Write 3-5 trigger prompts that should load the skill (English and Roman Urdu) and 1-2 that
   should not (near misses that belong to another skill).

## 3. GREEN: write the minimal skill

1. Pick the category folder: `skills/lifecycle/` (every project), `skills/stack/` (one stack)
   or `skills/repo/` (only this repo). Copy [references/skill-template.md](references/skill-template.md)
   into `skills/<category>/<skill-name>/SKILL.md`.
2. Name: kebab-case, matches the folder, no clash with built-in skills (Claude Code has
   `code-review`, so ours is `review-pr`).
3. Description, one line, under 1024 characters, no `<` `>` and no ` #`:
   `Use when <situations + phrases people type>. <What it does, one or two sentences>. Keywords - <terms>. Not for <near misses> (use <skill>).`
   Topics are fine; an ordered list of steps is not (agents follow it and skip the body).
4. Body: only what fixes the RED failures. Each CRITICAL rule carries its reason. One default
   per choice. Concrete, correct examples. Aim for 150-250 lines; move detail to `references/`
   (linked from SKILL.md, one level deep, "## Contents" at the top of files over 100 lines).
5. Run the same scenarios with the skill. Every RED failure must be gone. If not, the skill is
   unclear: fix the wording, not the test.

## 4. REFACTOR: close loopholes

- Run the scenarios again with more pressure. New excuse found = add it to Red flags with the
  answer, re-test.
- Cut what the agent didn't need: any section it never used in the runs, any explanation of
  general knowledge.

## 5. Validate and ship

1. `node tools/validate-skills.mjs` - must show 0 errors. Fix warnings unless there's a reason.
2. Add the trigger prompts to `tools/trigger-test/prompts.tsv` (`id, fixture, expected, prompt`)
   and run `bash tools/trigger-test/run.sh`. The whole suite must pass, not only the new rows.
3. Bump `metadata.version`: patch = wording or examples; minor = new rule, step or reference
   file; major = rule removed or reversed, rename, or a different job.
4. New skill: add a row to the README skills table and to the "Team skills" table in
   `skills/lifecycle/docs-keeper/references/agents-md-template.md`. Don't add project skills to this repo's own
   `AGENTS.md`: its table lists only skills for working on this repo (like this one).
5. PR description: RED failures, GREEN results, trigger test total, validator output. Use the
   checklist in [references/review-checklist.md](references/review-checklist.md).

## Reviewing a skill

Read it as the agent would, with no other context. Check it against
[references/review-checklist.md](references/review-checklist.md). Report findings as: section,
problem, why the agent would go wrong, suggested fix.

## Definition of done

- [ ] RED baseline recorded (3+ scenarios, exact failures)
- [ ] GREEN: same scenarios pass with the skill
- [ ] Validator: 0 errors
- [ ] Full trigger suite passes, including the new prompts
- [ ] Version bumped; README and AGENTS.md template rows updated for a new skill
- [ ] PR description has the evidence above

## Red flags: stop and fix

- Writing the skill before running a baseline ("I know what agents get wrong"), or a final
  report that doesn't say the baseline wasn't run
- A project skill added to this repo's own AGENTS.md table
- "It's only the description" as a reason to skip the trigger test
- A description that lists the workflow in order, or says "I" or "you"
- Explaining general programming knowledge the agent already has
- Several options with no default ("use Zod, Joi or Yup")
- A reference file linking to another reference file that SKILL.md doesn't link
- Editing a file in `skills/third-party/`
- A new skill with no row in the AGENTS.md template (it won't trigger on coding tasks)

## References

[Skill template](references/skill-template.md): frontmatter and body skeleton to copy.
[Review checklist](references/review-checklist.md): what to check before a skill PR merges.
