# Pre-deploy checklist

Copy into the card comment or release notes. Fill every line; write `N/A - reason` instead of leaving one blank.
Write env var **names** only, never values.

## Release

- Ticket(s):
- Target environment: staging / production
- Commit SHA:                      Build / image tag:
- CI run link (green for this SHA, lint + typecheck + tests + build):
- Planned time:                   Watch window: 30 / 60 min
- Deployer:                       Rollback owner (available whole window):
- Open incidents right now? no / yes (if yes, don't deploy)

## Database

- Migrations in this release (file names):
- Backwards-compatible with the code running now? yes / no -> split it (expand / contract)
- Destructive steps (drop, rename, type change, NOT NULL without default)? none / moved to a later release
- Large tables / locks checked; estimated run time on staging:
- Way back: tested downgrade / down script / forward-fix plan:
- Backup taken (time, location, restore time estimate):
- Order: migrate before code / code before migrate / pipeline does both

## Config

- New env var names (from `.env.example` / config schema):
- Present in target environment? yes / missing:
- Removed or renamed env vars:
- Feature flags and state per environment (off / on / %):
- Who turns flags on, and when:
- Webhooks (URL + signing secret per env):
- OAuth redirect / callback URLs:
- CORS allowed origins / allowed domains:
- Third-party keys in the right mode (test vs live):
- Cron jobs / queues / scheduled tasks affected:

## Staging

- Deployed same SHA/build to staging: yes / no staging
- Smoke test (result + evidence link):
  - [ ] Login / logout
  - [ ] Payment / checkout (test mode)
  - [ ] Core feature:
  - [ ] Changed feature:
- New errors in staging monitoring during test: none / list
- Rollback rehearsed on staging (required for migrations / infra changes):

## Production

- Approval for deploy step (who, when):
- Approval for migration step (who, when):
- Production smoke test result + evidence:
- Rollback thresholds for this release (defaults in SKILL.md section 5):
  - Error / 5xx rate above:
  - p95 latency above:
  - Crash-free sessions below:
  - Business signal (orders, signups, payments) below:
- Watch window result: healthy / rolled back (dashboard links):

## Release notes

- User-facing changes:
- Known issues:
- Follow-ups (contract migration, flag removal):
