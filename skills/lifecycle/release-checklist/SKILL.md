---
name: release-checklist
description: Use when a PR is approved or merged and the change is about to go out, or has just gone out - the user says deploy to staging, release this, ship it, go live, push to production, is it safe to deploy, deploy checklist, run migrations on prod, post-deploy check, smoke test prod, watch Sentry after deploy, rollback, revert the deploy, hotfix. Covers the CI gate, pre-deploy checklist (migrations with expand/contract, env vars, feature flags, webhooks, OAuth redirects, CORS), staging smoke test, production smoke test, error-monitoring window with rollback thresholds, rollback per hosting type (Vercel, Docker, PM2, VPS) and the hotfix path. Any stack. Not for preparing or reviewing the PR itself - use pr-ready or review-pr for that.
metadata:
  author: NextPak AI Team
  version: 0.1.0
---

# Release Checklist

Phase 6 of the lifecycle: the PR is approved or merged, and now it has to reach users safely.
Goal: every release can be undone in minutes, and problems are caught by us before users report them.

## CRITICAL rules

- **The agent never deploys to production, runs production migrations, changes production env vars,
  or rolls back production on its own.** It prepares, checks and explains. It runs a production step
  only after the developer approves **that exact step** in this session ("yes, run the migration" does not
  also approve the deploy). Approval for staging is not approval for production.
- **Roll back first, investigate after.** If a threshold in section 5 is hit, recommend rollback
  immediately. Do not try a quick forward fix in production while users are affected.
- **Deploy only the exact commit that passed CI.** Same commit SHA (or same image tag / build) on
  staging and production. Never rebuild "the same code" for production from a different commit.
- **No destructive DB change in the same release as the code that stops using it.** Drops, renames and
  type changes go out in a later release (expand/contract, section 3).
- **No release without a written rollback plan** (how, who, how long). "We'll redeploy the old version"
  is not a plan if a migration ran.
- **Evidence before claims.** "Deployed", "smoke test passed", "no new errors" only with output,
  screenshots or links from this session.
- Never print, paste or commit secrets while comparing env vars. Compare **names**, not values.

## What the agent does alone vs. with approval

| Agent does on its own (read-only or local) | Needs explicit approval for that step |
|---|---|
| Check CI status for the commit, read logs | Deploy to production (or promote a build to prod) |
| Read migrations, flag risky ones, draft the restore plan | Run any migration against production |
| Diff `.env.example` against the env var **names** in the target | Add/change/delete production env vars or secrets |
| Fill the pre-deploy checklist and rollback runbook | Turn production feature flags on/off |
| Smoke test staging; read-only checks on production | Roll back or redeploy production |
| Read Sentry / logs / dashboards | Change DNS, webhooks, OAuth or CORS settings in prod |
| Draft release notes and the card comment | Deploy to staging *if the project says staging is shared or gated* |

If the project's `AGENTS.md` / `CLAUDE.md` gives stricter rules, follow those.

## 1. CI gate (exact commit)

1. Get the SHA you will deploy: `git rev-parse HEAD` on the merged target branch (or the release tag).
2. Confirm CI is green **for that SHA**: lint, typecheck, tests, build. Example: `gh run list --commit <sha>`
   or the CI page. A green run on the PR branch before the merge does not count if the merge result differs.
3. Red or missing check: stop. Don't deploy "because it passed locally".
4. Note the SHA, build/image tag and CI link in the checklist. This is what you roll back **from**.

## 2. Pre-deploy checklist

Copy [references/pre-deploy-checklist.md](references/pre-deploy-checklist.md) into the card or release
notes and fill every line (write "N/A" with a reason, never leave blank). Summary:

- **Migrations reviewed** (section 3).
- **Env vars:** list names in `.env.example` (or the config schema) and compare with the target environment
  (Vercel project settings, server `.env`, Docker/compose env, cloud secret manager). Every new name exists
  in the target; removed ones are noted. Config lives in the environment, never in code
  ([twelve-factor](https://12factor.net/config)).
- **Feature flags:** decided per environment: off, on, or % rollout. Risky new behavior ships **off** in
  production and is turned on after the deploy looks healthy. Write who flips it and when.
- **Third-party config:** webhook URLs and signing secrets, OAuth redirect/callback URLs, CORS allowed origins,
  allowed domains, API keys with the right mode (test vs live), cron/queue schedules.
- **Rollback plan written:** fill [references/rollback-runbook.md](references/rollback-runbook.md): method,
  owner, expected time, and what happens to data.
- **Release notes:** what changed for users, ticket links, migrations, flags, known issues.
- **Timing:** not during an open incident; not right before the team goes offline (no Friday-evening deploys
  unless it's a hotfix); someone who can roll back is available for the whole watch window.

## 3. Database migrations

Use **expand / contract** (parallel change): old and new code must both work against the schema at
every moment of the deploy, so a code rollback never needs a schema rollback.
([Fowler](https://martinfowler.com/bliki/ParallelChange.html),
[Google CRE](https://cloud.google.com/blog/products/gcp/reliable-releases-and-rollbacks-cre-life-lessons/))

| Release | Schema | Code |
|---|---|---|
| 1. Expand | Add new column/table, nullable or with a default. Nothing removed. | Old code keeps working; new code writes both (or reads new with fallback) |
| 2. Migrate | Backfill data (in batches for big tables) | Switch reads to the new shape |
| 3. Contract | Drop the old column/table **in a later release**, once nothing reads it | Old path deleted |

Check every migration for:
- **Backwards-compatible?** Would the currently-running code break if this ran first? Renames, drops,
  `NOT NULL` without default, and type changes usually break it. Split them per the table above.
- **Locks and duration:** large table + index or column rewrite can lock writes. Use the DB's online option
  (e.g. Postgres `CREATE INDEX CONCURRENTLY`) and estimate run time on staging data.
- **Way back:** a tested downgrade (Alembic `downgrade`, Knex/Sequelize `down`), or a written restore plan.
  Prisma has no automatic down migrations: generate a down script with `prisma migrate diff`, or plan a
  forward-fix ([Prisma docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations)).
- **Backup** taken and confirmed (with time and location) before any risky migration: drops, data rewrites,
  backfills, anything not trivially reversible. Know how long a restore takes.
- Run on staging first, with realistic data volume when possible.
- Order: migrate (expand) **before** deploying the code that needs it, unless the project's pipeline does both.

## 4. Staging first (when a staging environment exists)

1. Deploy the same SHA/build to staging. Run migrations there first.
2. **Smoke test critical flows**, not the whole app: login/logout, signup if touched, payment/checkout
   (test mode), the core feature of the product, and the feature this release changes.
3. Use Playwright MCP or the project's E2E suite; levels and evidence rules are in the **testing-qa** skill.
   Save screenshots of the end state of each flow.
4. Check staging error monitoring and logs for new errors during the smoke test.
5. Test the rollback on staging when the release has a migration or infra change (the CRE advice: a rollback
   you have never run is a guess).

No staging? Say so in the checklist, ship risky parts behind a flag, and shorten the step between deploy and
smoke test on production.

## 5. Production deploy and watch window

Only after the developer approves the deploy step.

1. Deploy the approved SHA/build. Use a canary / gradual rollout if the platform has one (small slice of
   traffic first, compare against the old version - [Google SRE](https://sre.google/workbook/canarying-releases/)).
2. Run migrations only if separately approved, in the order planned in section 3.
3. **Production smoke test** within 5 minutes: the same critical-flow list as staging, read-only or with a
   test account. Never create real payments or touch real customer data; use the documented test account.
4. **Watch window: 30 minutes minimum, 60 for migrations, payments or auth changes.** Watch:
   - Error monitoring (e.g. Sentry MCP if connected): new issues tagged with this release, error rate vs the
     previous release, release health crash-free sessions/users
     ([Sentry release health](https://docs.sentry.io/product/releases/health/)). The release must be tagged
     (SDK `release` = commit SHA or version) or you can't compare.
   - Logs and platform metrics: 5xx rate, p95 latency, restarts/crash loops, queue backlog, DB connections.
   - Business signal: signups, orders, payments still coming in at the normal rate.
5. **Roll back when any of these happens** (agree project-specific numbers in the checklist):
   - A critical flow fails in the smoke test (login, payment, core feature)
   - A new error type affecting real users that didn't exist before the release
   - 5xx or error rate clearly above the pre-deploy baseline (e.g. 2x for 5+ minutes)
   - Crash-free sessions drop noticeably below the previous release, or the app is crash-looping
   - p95 latency much worse than baseline (e.g. 2x) for 5+ minutes
   - Payments, webhooks or data writes failing, or data looks wrong
   Recommend the rollback immediately with the evidence; run it once approved.
6. Post the result (healthy or rolled back) with links to the dashboards you checked.

## 6. Rollback

Fill the runbook before the deploy; [references/rollback-runbook.md](references/rollback-runbook.md) has
the commands per hosting type. Short version:

- **Vercel:** Instant Rollback in the dashboard (or `vercel rollback`), then undo later with
  `vercel promote <deployment>`. Env vars are **not** rolled back, and auto-assignment of production
  domains turns off until you promote again ([Vercel docs](https://vercel.com/docs/instant-rollback)).
- **Docker / compose / k8s:** redeploy the previous **immutable image tag** (never `latest`); confirm the old
  tag still exists in the registry.
- **PM2 / VPS:** `pm2 deploy ecosystem.config.js production revert 1` if PM2 deploy is used
  ([PM2 docs](https://pm2.keymetrics.io/docs/usage/deployment/)); otherwise check out the previous tag,
  install, build, `pm2 reload`.
- **Git:** `git revert` the merge commit on the target branch and let the pipeline redeploy (keeps history;
  don't force-push the main branch).
- **Database:** if expand/contract was followed, roll back **code only**. Restore from backup only for real
  data loss or corruption, since it also loses writes made after the backup. Usually prefer a forward-fix
  migration for schema problems.
- **Feature flag:** if the problem is behind a flag, turning the flag off is the fastest rollback.

After a rollback: confirm the old version is live (smoke test again), watch 15 minutes, then investigate with
the **systematic-debugging** skill. The fix comes back as a normal PR.

## 7. Hotfix path

Small, fast, still tested. A hotfix skips the waiting, not the checks.
- Branch from what is **in production** (the deployed tag/SHA), not from a busy `develop`.
- Smallest change that fixes the problem. No refactors, no extra features.
- A failing test that reproduces the bug, then the fix (testing-qa). CI must be green.
- Short review is still required (one reviewer is fine). Then staging smoke test of the broken flow, prod
  deploy with approval, watch window.
- Merge the fix back into every active branch (`develop` and `main`) so the bug doesn't return.
- If a rollback already stopped the damage, it's not a hotfix anymore: use the normal flow.

## 8. After the release

- **Card:** update it via the **nextsprint-workflow** skill. Move it to the next stage only if the team's
  board flow says developers do that; otherwise add a comment: version/SHA, environments, smoke-test result,
  watch-window result, links.
- **Release note / changelog:** add the entry (`CHANGELOG.md`, GitHub release, or the team's channel).
- **Flags:** schedule removal of flags that are now fully on; schedule the "contract" migration if one is due.
- **Close-out and handoff:** **docs-keeper** skill: decisions, domain docs, session handoff. If something went
  wrong, add a rule, test or check so it can't repeat.

## Definition of done

- [ ] CI green for the exact SHA/build that was deployed (link noted)
- [ ] Pre-deploy checklist filled; no blank lines
- [ ] Migrations backwards-compatible; nothing destructive in the same release; backup or downgrade ready
- [ ] Env var names match between `.env.example` and the target; third-party config checked
- [ ] Rollback runbook filled (method, owner, time) before the deploy
- [ ] Staging smoke test passed with evidence (or "no staging" stated)
- [ ] Every production step had the developer's explicit approval
- [ ] Production smoke test passed; watch window completed with thresholds checked
- [ ] Card updated, release note written, docs-keeper close-out done

## Red flags: stop

- About to run a deploy, migration or env change in production without approval for that step
- Deploying a different commit than the one CI tested, or a `latest` image tag
- A migration that drops, renames or tightens a column in the same release as the code change
- "We can just restore the backup" with no backup taken today and no known restore time
- Trying a quick fix in production while errors are rising instead of rolling back
- "Looks fine" without checking error monitoring for the new release
- Env values (secrets) pasted into chat, logs or the card
- Deploying with nobody available to roll back for the next hour
