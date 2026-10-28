# NextPak AI Skills (this repo)

Source of the team's agent skills, grouped under `skills/` (`lifecycle/`, `stack/`, `repo/`);
`skills/third-party/` holds unmodified external skills; `docs/` is for people; `tools/` holds the
validator and the trigger test.

## Commands

| Task | Command |
|---|---|
| Validate all skills | `node tools/validate-skills.mjs` |
| Trigger test (uses Claude Code tokens) | `bash tools/trigger-test/run.sh` |

## Skills for working on this repo: read the file BEFORE making changes

The skills here are source files, not installed skills, so read them directly:

| When the task is... | Read first |
|---|---|
| Creating, changing, fixing or reviewing a skill in this repo | `skills/repo/skill-authoring/SKILL.md` |
| Improving or writing a prompt | `skills/lifecycle/prompt-engineering/SKILL.md` |
| About to say work is done, fixed or passing | `skills/third-party/superpowers/verification-before-completion/SKILL.md` |

Don't copy skills into `.claude/skills/` or `.agents/skills/` here; the trigger test builds its
own installed copies.

## Rules

- Follow `docs/writing-skills.md`. Every skill change: validator 0 errors, full trigger suite
  passes, `metadata.version` bumped.
- Never edit files in `skills/third-party/`; copy into a team skill with credit instead.
- Everything in this repo is written in English.
- No secrets, customer data or credentials in any file. Fixtures use placeholders only.
