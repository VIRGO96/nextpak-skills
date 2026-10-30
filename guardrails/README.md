# Team guardrails

Guardrails make a mistake by an agent (or a person) cheap: high-risk actions are blocked before
they run, and secrets can't reach git. They sit on top of the AGENTS.md rules, which agents
follow most of the time; guardrails cover the rest.

## Contents

- Three layers
- What is blocked
- Install (lead, once per project)
- Every developer (once per project)
- When something is blocked
- Per tool
- Changing the rules
- Testing
- Sources

## Three layers

| Layer | Where it runs | Works in | Stops |
|---|---|---|---|
| 1. Permissions | Inside the agent tool, before a command or file access | Claude Code, Codex (shared project files); Antigravity (each developer's settings) | Known-risky commands and secret files; asks before pushes |
| 2. Agent guard hook | Inside the agent tool: `.guardrails/agent-guard.mjs` checks every command and file access | Claude Code, Codex, Antigravity (IDE 2.6.0 tested) | The full list below, with a reason the agent can act on |
| 3. Git and CI | `git commit` (pre-commit hook) and every PR (GitHub Actions) | Every tool and every person | Secret files and secrets in commits; flags agent-config changes for a lead's review |

Layer 3 is the one that always works, whatever tool or model is used. Layers 1 and 2 stop
problems earlier, before a command runs.

## What is blocked

| Risk | Examples | Why |
|---|---|---|
| Production | `NODE_ENV=production`, `.env.production`, `--env prod`, a `DATABASE_URL` or URL pointing at prod | AGENTS.md: agents never connect to or change production |
| Deploy, publish, merge, repo settings | `vercel --prod`, `firebase deploy`, `npm publish`, `gh pr merge`, `gh secret set`, `terraform apply` | A person does these through `release-checklist` |
| Force-push and deleting remote branches | `git push -f`, `--force-with-lease`, `+main`, `--delete` | Rewrites shared history |
| Skipping or changing git hooks | `--no-verify`, `git commit -n`, `core.hooksPath`, `HUSKY=0` | Hooks run the secret check |
| Destructive SQL | `DROP TABLE`, `TRUNCATE`, `DELETE FROM x` without `WHERE`, `dropDatabase()`, `deleteMany({})`, `FLUSHALL` | Changes go through migration files in a PR |
| Database resets | `prisma migrate reset`, `db push --accept-data-loss`, `supabase db push`, `alembic downgrade` | Wipes or overwrites data |
| Wide deletes | `rm -rf /`, `~`, `.`, `*`, `.git` | Unrecoverable |
| Running downloaded scripts | `curl ... \| bash`, `iwr ... \| iex` | Runs unreviewed code |
| Secrets | reading or writing `.env` (not `.env.example`), `*.pem`, `*.key`, SSH keys, `.npmrc`, service-account JSON, `dbhub.toml`; `printenv`, `env`; printing or sending one secret variable (`echo $GITHUB_PAT`, `$env:API_KEY`, `curl ... $TOKEN`, `node -e` reading it) | Secrets never enter the chat (they go to the AI provider) |
| Agents editing their own guardrails | writing `.guardrails/`, `.nextpak/`, `.claude/settings.json`, `.codex/`, `.agents/hooks.json`, `.mcp.json`, `.git/hooks` | Changes are made by a person and reviewed |

Asked first (Claude Code, Codex): `git push`, `git reset --hard`, `git clean`, `git rebase`,
`vercel ...`, `curl`. Allowed without asking: tests, lint, typecheck, build, `git status/diff/log`.

The pre-commit hook blocks: secret files, private keys, AWS/GitHub/Stripe live/Slack/Google/
OpenAI/Anthropic keys, JWTs, and database URLs with a password for a non-local host. With
gitleaks installed it adds gitleaks' full rule set. CI runs gitleaks on every PR and push to main.

When something is blocked, the agent gets the reason and is told (AGENTS.md block) to stop and
tell the developer, never to work around it. Blocks are logged to `.git/agent-guard.log` (rule
and tool only, never the command).

## Install (lead, once per project)

The project setup installs them (on by default; see the root README, "Set up a project"):

```bash
npx github:VIRGO96/nextpak-skills init       # in the project folder; asks for the lead's GitHub user
# or only the guardrails, from a clone of this repo:
node tools/guardrails.mjs install ../my-app [--tool claude|agents|codex|all] [--lead <github-user>]
```

It writes:

- `.guardrails/`: `agent-guard.mjs`, `check-staged.mjs`, `git-hooks/pre-commit`
- `git config core.hooksPath .guardrails/git-hooks` (this clone)
- `.github/workflows/ai-guardrails.yml`, `.github/pull_request_template.md` (if missing),
  `.github/CODEOWNERS` entries for agent config (with `--lead`)
- `.gitignore` secret patterns, `.gitattributes` (LF for the hook scripts), an AGENTS.md block
- Claude Code: `.claude/settings.json` permissions and hook (merged with what's there)
- Codex: `.codex/rules/nextpak.rules`, `.codex/hooks.json`
- Antigravity: `.agents/hooks.json`

Then:

1. Commit all of it in a PR (nothing in these files is secret). The setup adds a `prepare`
   script to `package.json`, so `npm install` turns on the git hooks for everyone.
2. **Repo admin, in GitHub settings:** protect `main`: require a PR, require the "AI guardrails"
   checks, require review from Code Owners, block force-pushes.
3. Updating later: `npx github:VIRGO96/nextpak-skills update`. `.guardrails/`, the Codex rules
   and the CI workflow are replaced; settings files are merged (your own entries are kept).

## Every developer (once per project)

1. `npm install`, then `npm run ai:setup`: it turns on the git hooks for your clone and checks
   the rest (without a root `package.json`: `node .nextpak/doctor.mjs`).
2. Install gitleaks once per machine: `winget install gitleaks` (Windows), `brew install gitleaks`
   (macOS) or `scoop install gitleaks`.
3. Your tool:
   - **Claude Code:** nothing else; permissions and the hook load from `.claude/settings.json`.
   - **Antigravity:** [antigravity.md](antigravity.md) part 1 (open and trust, permissions, reload).
   - **Codex:** trust the project, then run `/hooks` once to review and trust the hook.
4. Check: ask the agent "run printenv". It must answer "Blocked by team guardrails".

## When something is blocked

- **The agent was blocked:** it gets the reason and tells you what it wanted to do. If the action
  is really needed (deploy, production data, force-push), a person does it through
  `release-checklist`.
- **Your commit was blocked:** the message names the file and the kind of secret. Remove it,
  keep the value in your environment, rotate it if it was ever pushed. Never `--no-verify`.
- **A false positive:** send the lead the message and the command. Rules are fixed here, tested,
  and re-installed; don't edit `.guardrails/` in a project.
- **See what was blocked:** `cat .git/agent-guard.log` (rule and tool only).

## Per tool

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Permissions | `.claude/settings.json` (shared) | `.codex/rules/nextpak.rules` (shared, trusted projects) | Each developer's settings ([antigravity.md](antigravity.md)) |
| Agent guard hook | `.claude/settings.json` `hooks.PreToolUse` | `.codex/hooks.json` (trust it with `/hooks`) | `.agents/hooks.json`: runs in IDE 2.6.0 (tested); re-test after updates |
| Bypass mode | Disabled (`disableBypassPermissionsMode`) | Don't use `--dangerously-bypass-approvals-and-sandbox` | Never use the Turbo preset |
| Git and CI | Same for all | Same for all | Same for all |

## Changing the rules

- The rules live here, in `guardrails/`. Projects get a copy, so change them here, run
  `node tools/guardrails-test.mjs`, then re-run the installer in each project.
- Add a test case to `tools/guardrails-test.mjs` for every new rule and for any false positive
  you fix.
- A false positive in a project? Tell the lead; don't edit `.guardrails/` in the project (agents
  can't, and a person's edit would be overwritten on the next install).
- A test fixture that only looks like a secret: add the comment `nextpak-guard: allow` on that line.

## Testing

```bash
node tools/guardrails-test.mjs   # 310 cases: commands, files, output formats, pre-commit
```

Recorded so far (Claude Code, Sonnet, headless, 2026-10-29): `printenv` blocked by the hook;
`.env` read blocked by permissions; force-push and reading a password refused by the agent
because of the AGENTS.md rules before any tool call. Pre-commit blocked a staged `.env` and an AWS
key; a normal commit passed. Antigravity IDE 2.6.0 (2026-10-29): 6/6 risky calls blocked by the
hook (env dump, force-push, `.env` by file tool and by `cat`, editing `.agents/hooks.json`, `prisma
migrate reset`), 2/2 safe calls ran, all blocks in the log; details in [antigravity.md](antigravity.md).
Codex: not run yet (not installed here).

## Sources

- Claude Code: [settings and permissions](https://code.claude.com/docs/en/settings), [hooks](https://code.claude.com/docs/en/hooks)
- Codex: [hooks](https://learn.chatgpt.com/docs/hooks), [rules](https://learn.chatgpt.com/docs/agent-configuration/rules)
- Antigravity: [hooks](https://antigravity.google/docs/hooks), [permissions](https://antigravity.google/docs/permissions)
- [gitleaks](https://github.com/gitleaks/gitleaks) (CLI, MIT). The gitleaks GitHub Action needs a licence key for organization repos, so CI uses the CLI instead.
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/): excessive agency, sensitive information disclosure, supply chain
- GitHub: [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), [security hardening for Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) (pinned action SHAs, read-only token, no untrusted input in scripts)
