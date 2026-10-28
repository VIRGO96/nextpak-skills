# Rollback runbook

Fill section A **before** the deploy. Every production command below needs the developer's explicit
approval at the moment it runs. Roll back first, investigate after.

## A. Fill-in (per release)

- Release / SHA being deployed:
- Roll back **to** (previous SHA / deployment id / image tag):
- Confirmed the rollback target still exists (deployment listed, image in registry): yes / no
- Method (pick from section B):
- Exact command or dashboard steps:
- Owner:                          Backup person:
- Expected time to roll back:
- Data impact: none (expand-only migration) / needs forward-fix / needs restore (explain)
- Feature flag kill switch (name, how to turn off):
- How we confirm the rollback worked (smoke flows, dashboard):
- Who to tell (channel, client contact):

## B. Methods per hosting type

### Feature flag (fastest, if the change is behind one)
Turn the flag off in the flag tool or env, confirm the old behavior, keep the deploy.

### Vercel
- Dashboard: Project -> Production Deployment -> **Instant Rollback** -> pick deployment -> Confirm.
- CLI: `vercel rollback [deployment-url-or-id]`
- Undo later: dashboard **Undo Rollback**, or `vercel promote <deployment-url-or-id>`.
- Watch out: env vars are not rolled back; production domain auto-assignment stays off until you promote
  again (new pushes won't go live); custom aliases may need checking; cron definitions follow the old deployment.
- Hobby plan can only roll back to the immediately previous deployment.
- Source: https://vercel.com/docs/instant-rollback

### Docker / docker compose
```bash
# image tags must be immutable (SHA or version), never "latest"
IMAGE_TAG=<previous-tag> docker compose up -d <service>
docker compose ps && docker compose logs --tail=100 <service>
```
Kubernetes: `kubectl rollout undo deployment/<name>` then `kubectl rollout status deployment/<name>`.
Check the previous image wasn't pruned by registry cleanup rules.

### PM2 / VPS
- With PM2 deploy: `pm2 deploy ecosystem.config.js production revert 1`
  (source: https://pm2.keymetrics.io/docs/usage/deployment/)
- Without it:
  ```bash
  git fetch --tags && git checkout <previous-tag-or-sha>
  npm ci && npm run build          # or the project's build
  pm2 reload <app-name>            # zero-downtime reload in cluster mode
  pm2 logs <app-name> --lines 100
  ```

### Git revert + pipeline (any host with CI/CD)
```bash
git revert -m 1 <merge-commit-sha>   # creates a new commit; never force-push the main branch
git push origin <target-branch>
```
Slower (full pipeline) but keeps history clean. Use when there is no instant rollback.

### Database
- Expand/contract followed: roll back **code only**; the old code still works with the new schema.
- Failed migration: run the tested downgrade (Alembic `alembic downgrade -1`, Knex `migrate:rollback`,
  Sequelize `db:migrate:undo`) or Prisma's generated down script with `prisma db execute` +
  `prisma migrate resolve --rolled-back <name>`
  (https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations).
- Schema problem, data fine: prefer a **forward-fix** migration through the normal PR flow.
- Data lost or corrupted: restore from backup. This loses writes made after the backup, so decide with the
  team lead and tell affected users.

## C. After rolling back

1. Smoke test the critical flows again on the rolled-back version.
2. Watch error monitoring for 15 minutes before standing down.
3. Post on the card: what broke, when, rollback time, evidence links.
4. Investigate with the systematic-debugging skill; the fix comes back as a normal PR.
5. Undo platform rollback state if needed (e.g. Vercel promote) only when the fixed release ships.
