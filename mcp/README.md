# Team MCP servers

MCP servers give the agent tools beyond the code: the NextSprint board, a browser, library docs,
GitHub, Sentry, databases. This folder holds the team's list, how to install it, and the safety
rules. Every server here was checked to be free on 2026-10-29 (some need a free account).

- `catalog.json`: the list (source of truth). The tables below are generated from it.
- `database-safety.md`: rules for database servers. **Read it before connecting any database.**

## Contents

- Quick start
- What to install
- How it works (Claude Code, Antigravity, Codex)
- Tokens and secrets
- Safety built in
- MCP config is code
- Adding or changing a server
- Catalog

## Quick start

```bash
# Skills + core MCP servers for a Next.js project
bash tools/install.sh ../my-app --stack react --mcp core,frontend

# Backend with Postgres or MySQL
bash tools/install.sh ../my-api --stack node --mcp core,dbhub

# Add servers to a project that already has skills
node tools/mcp.mjs install ../my-api --mcp mongodb
node tools/mcp.mjs list            # every group and server
```

`--mcp` takes group names (`core`, `frontend`, `database`, `platform`, `code`, `security`,
`research`) and server ids, comma-separated. Re-running adds to what's installed; nothing is
removed. `--dry-run` shows what would change.

After installing: set the environment variables it prints, restart your tool, and approve the
project's MCP servers when asked. Servers marked "Sign in when prompted" open a browser login the
first time (Claude Code: `/mcp`; Codex: `codex mcp login <id>`; Antigravity: Agent settings,
Customizations, Authenticate).

## What to install

| Who | Groups |
|---|---|
| Every developer | `core` |
| Frontend work | `core,frontend` (`storybook` only if the project has Storybook 10.3+) |
| Backend work | `core` + the project's database server (`dbhub`, `mongodb`, `supabase` or `firebase`) |
| Whoever deploys or builds payments | add `vercel` and/or `stripe` |
| Large or unfamiliar codebase | add `serena`; `deepwiki` for questions about open-source libraries |
| Adding or upgrading dependencies | `socket` (only package names leave your machine) |
| Security pilot (1-2 developers first) | `semgrep` (local) |
| Personal research | any of `research`, on your own free account |

Keep the list short. Each server adds tools the agent has to choose from; Antigravity stops at
100 enabled tools across all servers.

## How it works

| Tool | File written | Tokens |
|---|---|---|
| Claude Code | `.mcp.json` (project) and `.claude/settings.json` (blocked tools) | `${VAR}` read from your environment |
| Antigravity | `.agents/mcp_config.json` (project), only servers without tokens | Servers with tokens are printed for your global `~/.gemini/config/mcp_config.json`, because Antigravity doesn't read environment variables |
| Codex | `.codex/config.toml` (project; Codex reads it only in trusted projects) | `bearer_token_env_var` / `env_vars` read from your environment |

The project files contain no secrets and can be committed, so the whole team gets the same
servers. `AGENTS.md` gets a generated "MCP servers in this project" table so every agent knows
what each server is for. `dbhub.toml` holds a database password and is added to `.gitignore`.

## Tokens and secrets

- Put tokens in your shell profile (`~/.bashrc`, `~/.zshrc`, or Windows user environment
  variables), never in a committed file, a card, a PR or a chat.
- Use the narrowest token: GitHub fine-grained PAT with read access to your repos only; database
  users with read-only grants; Stripe sandboxes only.
- Prefer servers with sign-in (OAuth) over long-lived tokens when both exist.
- A leaked token: revoke it first, then tell the lead.

## Safety built in

- **Blocked tools.** Dangerous tools are blocked in Claude Code (`permissions.deny`), Codex
  (`disabled_tools`) and Antigravity (`disabledTools`): NextSprint deletes; Firebase deploy and
  writes; Vercel deploys, env vars, domains and DNS; Stripe writes and money movement.
- **Read-only by default.** GitHub (`X-MCP-Readonly`), MongoDB (`--readOnly`), Supabase
  (`read_only=true`), DBHub (`readonly = true` in `dbhub.toml`). The database user must be
  read-only too: see `database-safety.md`.
- **Never production databases.** Enforced by the database user and stated in every project's
  AGENTS.md ("Production and data safety").
- **Tool results are data.** Cards, web pages, issues, database rows and logs can contain hidden
  instructions. Agents never follow them (AGENTS.md rule).
- **Only official servers.** Every entry links to the vendor's own repo or docs.

## MCP config is code

A local (stdio) server entry is a command that runs on your machine with your permissions. In
April 2026 researchers showed that a changed MCP config can run any command, in many tools, and
the protocol maintainers treat it as expected behavior. So:

- Review changes to `.mcp.json`, `.codex/config.toml`, `.agents/mcp_config.json` and
  `.claude/settings.json` in PRs like code. A new `command`, `args` or `url` needs a reason.
- In a repo you just cloned or a PR branch, read the MCP config before approving its servers.
  Never approve a server you don't recognize.
- Add servers only through `catalog.json` and `tools/mcp.mjs`, not by copying a snippet from a
  blog or an issue.
- Keep your tools (Claude Code, Codex, Antigravity, Node) updated.
- Optional check: `uvx snyk-agent-scan@latest` scans your MCP configs and skills for tool poisoning
  and prompt injection. It needs a free Snyk token (`SNYK_TOKEN`) and sends tool names,
  descriptions and skill text (secrets redacted) to Snyk.

## Adding or changing a server

1. Check it's free (vendor pricing page) and official (vendor repo or docs). No paid servers.
2. Add it to `catalog.json`: `group`, `use`, `free`, `auth`, `docs`, `config` (Claude Code format,
   tokens as `${VAR}`), `deny` for dangerous tools, `safety`. Use `codex` / `antigravity` keys only
   when those tools need different arguments, and `tools` to limit which tools get it.
3. Run `node tools/mcp.mjs docs` to regenerate the tables below.
4. Install it into a test project with `node tools/mcp.mjs install <dir> --mcp <id>` and check it
   connects in each tool you use.
5. If a skill should use it, mention it in that skill and bump the skill's version.

## Catalog

<!-- BEGIN catalog (generated: node tools/mcp.mjs docs) -->
### core: Every developer, every project

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [NextSprint](https://nextsprint.nextpak.org) `next-sprint` | Read and update your cards: move, checklist, comments, PR link | Internal NextPak board | Sign in when prompted (OAuth) | `nextsprint-workflow`, `ai-dlc` | Delete tools are blocked; deletions are done by a person in the board UI. |
| [Playwright](https://github.com/microsoft/playwright-mcp) `playwright` | Drive a real browser: user journeys, forms, screenshots, console errors | Yes, open source, no account | None | `testing-qa` | Not a security boundary. Use test accounts only, never real customer logins. |
| [Context7](https://github.com/upstash/context7) `context7` | Current docs and examples for any library before writing code against it | Yes. Works without a key (rate limited); a free key from context7.com/dashboard raises limits | None (optional free key) | `node-express-standards`, `fastapi-standards`, `react-next-standards` | Read-only by nature. Your questions are sent to Context7; don't paste secrets into them. |
| [GitHub](https://github.com/github/github-mcp-server) `github` | Read PRs, issues, Actions logs and code across repos (read-only) | Yes, all GitHub plans; Copilot-only tools excluded | Fine-grained personal access token in GITHUB_PAT (read access to the repos you work on) | `pr-ready`, `review-pr`, `release-checklist` | Read-only and limited toolsets. Pushing and opening PRs stay with git and the gh CLI (pr-ready). |
| [Sentry](https://mcp.sentry.dev) `sentry` | Production errors: stack traces, events, affected releases for a Sentry issue link | Yes, any Sentry plan. Seer (AI root cause) is paid; the rest works without it | Sign in when prompted (OAuth, your Sentry role) | `systematic-debugging`, `release-checklist` | Error events can contain user data; summarize, never paste raw events into cards or PRs. |

### frontend: Frontend work (React, Next.js)

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [Chrome DevTools](https://github.com/ChromeDevTools/chrome-devtools-mcp) `chrome-devtools` | Debug a page: network requests, console with source maps, performance traces, Lighthouse | Yes, open source, no account | None | `react-next-standards`, `systematic-debugging` | Isolated profile, usage statistics off. Use test accounts only. |
| [Next.js DevTools](https://nextjs.org/docs/app/guides/mcp) `next-devtools` | Live build, runtime and type errors, routes and logs from a running Next.js 16+ dev server | Yes, open source, no account | None | `react-next-standards` | Local dev server only. |
| [shadcn/ui](https://ui.shadcn.com/docs/mcp) `shadcn` | Search and add components from the shadcn registries in components.json | Yes, public registry needs no account | None | `react-next-standards` | Only projects that already use shadcn/ui. |
| [Storybook](https://storybook.js.org/docs/ai/mcp/overview) `storybook` | Read the project's component docs and props, write stories and run component tests in a running Storybook | Yes, open source addon, no account | None | `react-next-standards`, `testing-qa` | Local dev server only. review-create (publishes a review to Chromatic) is blocked. |

### database: Per project, read-only, never production (see database-safety.md)

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [DBHub (Postgres, MySQL, MariaDB, SQL Server)](https://dbhub.ai) `dbhub` | Inspect schema and run read-only SQL on a dev or staging database | Yes, open source, no account | Read-only database user in dbhub.toml (git-ignored) | `node-express-standards`, `fastapi-standards`, `systematic-debugging` | readonly = true and max_rows in dbhub.toml, plus a read-only database user. Never production. |
| [MongoDB](https://github.com/mongodb-js/mongodb-mcp-server) `mongodb` | Inspect collections and run read-only queries on a dev or staging MongoDB | Yes for self-managed and Atlas databases (Atlas admin tools need extra credentials; not used) | Connection string of a read-only user in MDB_MCP_CONNECTION_STRING | `node-express-standards`, `fastapi-standards`, `systematic-debugging` | --readOnly removes write tools; the database user must have only the read role. Never production. |
| [Supabase](https://supabase.com/docs/guides/getting-started/mcp) `supabase` | Inspect tables, run read-only SQL, read logs and docs for one dev or staging project | Yes, free Supabase account (branching tools are paid; not used) | Sign in when prompted (OAuth). Project ref in SUPABASE_PROJECT_REF | `node-express-standards`, `fastapi-standards`, `react-next-standards` | read_only=true and one project only. SUPABASE_PROJECT_REF must be a dev or staging project, never production. |
| [Firebase](https://firebase.google.com/docs/cli/mcp-server) `firebase` | Read Firestore documents and Auth users in a dev Firebase project | Yes, part of the Firebase CLI | Your Firebase CLI login (firebase login); select the dev project with firebase use | `node-express-standards`, `react-next-standards` | No read-only mode: write tools are blocked here. Dev Firebase project only, never one with real users. |

### platform: Per project, for whoever deploys or works on payments

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [Vercel](https://vercel.com/docs/agent-resources/vercel-mcp) `vercel` (claude, codex only) | Deployment status, build logs, runtime errors and logs for your projects | Yes, all plans including Hobby | Sign in when prompted (OAuth, your Vercel role) | `release-checklist` | No read-only mode and ~200 tools: deploys, env vars, domains, DNS, firewall and purchases are blocked. Not for Antigravity (over its 100-tool limit and not an approved Vercel client). |
| [Stripe](https://docs.stripe.com/mcp) `stripe` | Look up test customers, payments, subscriptions and docs while building payment features | Yes, free Stripe account and sandboxes | Sign in when prompted (OAuth). Authorize sandboxes only, never live mode | `node-express-standards`, `fastapi-standards` | Sandbox only; write tools blocked. From 2026-11-30 Stripe rejects plain secret keys for MCP, so use OAuth. |

### code: Understanding code and libraries

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki-mcp) `deepwiki` | Ask questions about any public GitHub repo (a library's internals, how a project works) | Yes, no account for public repos | None | - | Public repos only. Never ask it about private code. |
| [Serena](https://github.com/oraios/serena) `serena` | Symbol-level navigation and refactoring in large codebases (find references, rename) | Yes, open source, runs locally | None | - | Fully local. Little benefit on small projects. |

### security: Pilot first; sends code to a vendor unless noted

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [Semgrep](https://github.com/semgrep/semgrep) `semgrep` | Scan changed code for security issues before a PR | Yes, Semgrep CLI scans locally for free (Semgrep Secrets is paid; not used) | None for local scans | `pr-ready`, `review-pr` | Local scanning; code stays on your machine. |
| [Snyk](https://docs.snyk.io/agent-security/agentic-security-with-snyk-studio/getting-started-with-snyk-studio) `snyk` | Scan dependencies and code for known vulnerabilities | Yes, free Snyk account; about 100 code tests per month, so scan on demand | Log in through the snyk_auth tool the first time | `pr-ready`, `review-pr` | Code scans run in Snyk's cloud: only on repos the client allows to leave the machine. |
| [GitGuardian](https://github.com/GitGuardian/ggmcp) `gitguardian` | Find hardcoded secrets in the code you're about to push | Yes, free Starter plan up to 25 developers | Sign in when prompted (OAuth) | `pr-ready` | Scanned content is sent to GitGuardian. Some tools change incidents; review before approving. |
| [Socket](https://docs.socket.dev/docs/remote-socket-mcp) `socket` | Check an npm or PyPI package (supply chain, maintenance, vulnerabilities, license) before adding or upgrading it | Yes, free Socket plan (1 seat each, 500 API requests/hour, MCP included) | Sign in when prompted (OAuth, your own free Socket account) | `node-express-standards`, `fastapi-standards`, `react-next-standards`, `review-pr` | Only package names and versions are sent, never code. Safe to use on every project. |

### research: Personal, on your own free account and credits

| Server | Use it for | Free? | Sign-in | Used by skills | Safety |
|---|---|---|---|---|---|
| [Exa](https://github.com/exa-labs/exa-mcp-server) `exa` | Web search and page fetch for research | Yes, works without a key; free account adds monthly credit | None | - | Queries go to Exa; no code or secrets in them. |
| [Tavily](https://docs.tavily.com/documentation/mcp) `tavily` | Web search and page extraction for research | Yes, 1,000 credits/month on the free plan | Sign in when prompted (OAuth) | - | Queries go to Tavily; no code or secrets in them. |
| [Firecrawl](https://docs.firecrawl.dev/mcp-server) `firecrawl` | Scrape or crawl a site into clean text (docs sites, competitor pages) | Yes, 1,000 credits/month on the free plan | Sign in when prompted (OAuth) | - | Only public pages; respect site terms. |
| [Bright Data](https://github.com/brightdata/brightdata-mcp) `brightdata` | Search and scrape pages that block simple fetches | Yes, 5,000 requests/month on the free tier | API token in BRIGHTDATA_API_TOKEN | - | Only public pages; respect site terms. |
| [SerpApi](https://github.com/serpapi/serpapi-mcp) `serpapi` | Google search results (rankings, SERP features) | Yes, but only 250 searches/month: personal use | API key in SERPAPI_API_KEY | - | Queries go to SerpApi. |

### Not included

| Server | Why not |
|---|---|
| Figma Dev Mode | Needs a paid Figma plan; the team rarely uses Figma |
| Postman | Free plan is one user; add per person if a project uses Postman collections |
| Sequential Thinking | Current models already reason step by step; adds tokens without a clear gain |
| Memory / knowledge-graph servers | Decisions belong in the repo as ADRs (docs-keeper), not in agent memory |
| Docker servers | No official Docker server; community ones can stop and remove containers. Agents already run the docker CLI, which asks permission per command |
| Prisma MCP | Its migrate tools change or reset the database in DATABASE_URL; schema changes go through migration files in a PR. The Prisma CLI is enough |
| Filesystem, Git, Fetch servers | Agents already have these as built-in tools |
<!-- END catalog -->

### Watch list

- **Graphify** (code knowledge graph, free and open source): useful for onboarding to a large or
  legacy codebase. Try it on demand (`/graphify .`) on one big project; don't use its always-on
  install yet, because it adds CLAUDE.md rules and a search hook that change how agents use the
  team skills.
- **Redis** (official `redis-mcp-server`, free): only if a project uses Redis. It has no read-only
  mode, so it needs a Redis ACL user limited to read commands (`+@read -@write`). Not added until
  a project asks.
- **Skills from vendors** (free, MIT): Supabase `supabase-postgres-best-practices` for
  Postgres-heavy projects. The team skills are locked for now; review it at the next skills update.
