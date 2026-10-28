# Skill review checklist

Copy into the PR description. `node tools/validate-skills.mjs` checks the items marked (auto).

## Need

- [ ] A real, repeated agent failure this skill fixes; RED results attached
- [ ] Not better as an AGENTS.md rule, a reference file or a script
- [ ] No existing skill already covers it

## Format

- [ ] Folder name = `name`, kebab-case, max 64 characters, no reserved words (auto)
- [ ] File is `SKILL.md`; no `README.md` inside the folder (auto)
- [ ] Description under 1024 characters, one line, no `<` `>`, no ` #` (auto)
- [ ] Description starts "Use when", has real phrases, says what it does, has "Not for" (auto for "Use when" and "Not for")
- [ ] Description lists topics, not ordered steps; no "I" or "you"
- [ ] `metadata.author` and `metadata.version` set (auto); version bumped
- [ ] Body under 500 lines (auto), aim 150-250
- [ ] Has CRITICAL rules, Definition of done and Red flags sections (auto)
- [ ] Every link works, uses forward slashes, references are one level deep (auto)
- [ ] Reference files over 100 lines start with `## Contents` (auto)

## Content

- [ ] Only what the agent doesn't already know; no general explanations
- [ ] Each CRITICAL rule has its reason
- [ ] One default per choice; escape hatch only when needed
- [ ] Examples are correct and follow the team stack skills
- [ ] Same term for the same thing throughout
- [ ] Works in Claude Code, Antigravity and Codex (tool names, paths)
- [ ] No secrets, customer data, credentials, or dates that will go stale
- [ ] English only

## Tests

- [ ] RED: 3+ scenarios without the skill, exact failures recorded
- [ ] GREEN: same scenarios pass with the skill
- [ ] New trigger prompts added (should and should-not) to `tools/trigger-test/prompts.tsv`
- [ ] Full trigger suite passes: `bash tools/trigger-test/run.sh`
- [ ] README table and AGENTS.md template row updated (new skill)
