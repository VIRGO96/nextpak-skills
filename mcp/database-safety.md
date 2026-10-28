# Database MCP safety

Agents can read and change data through database MCP servers. These rules apply to every database
MCP (DBHub for Postgres/MySQL, MongoDB, Supabase, Firebase) in every tool (Claude Code,
Antigravity, Codex). They are not optional.

## Contents

- The rules
- Access by environment
- Why the database user matters more than the MCP flag
- DBHub setup (Postgres, MySQL)
- Create a read-only user (Postgres, MySQL, MongoDB, Supabase, Firebase)
- Staging write access (the exception)
- Production incidents
- Checklist before connecting a database

## The rules

1. **Production: never write. Prefer no connection at all.** No MCP server ever gets a production
   user that can INSERT, UPDATE, DELETE, ALTER, DROP or run migrations, for any reason. If there's a
   problem that seems to need a write, a person does it through the normal release process
   (migration file, reviewed PR, `release-checklist`).
2. **Read-only by default everywhere else.** Shared dev and staging databases are connected with a
   read-only database user.
3. **Enforce it in the database, not only in the MCP.** Use a database user that has only read
   permissions. The MCP's read-only flag is a second layer, not the protection.
4. **No customer data in the model.** Everything an agent reads from a database is sent to the AI
   provider. Never point an MCP at data with real customer names, emails, phone numbers, payment
   details or anything else personal. Use seeded or anonymized data.
5. **Credentials stay out of git.** Connection strings live in each developer's own environment
   (`${VAR}` in `.mcp.json`), never in a committed file, card comment or chat log.
6. **One project, one database.** Scope each server to a single database or project
   (`project_ref` for Supabase, one DSN for DBHub). Never an org-wide or admin token.

## Access by environment

| Environment | Agent access | Database user | Who decides |
|---|---|---|---|
| Local (developer's own database, seeded data) | Read and write | Local dev user | Developer |
| Shared dev | Read-only | `<app>_ai_read` | Default |
| Staging | Read-only | `<app>_ai_read` | Default |
| Staging, write exception | Write, time-boxed | `<app>_ai_staging_write` | Developer OKs it for this session; see "Staging write access" |
| Production | **None** (incident: read-only replica only) | `<app>_ai_prod_read` on a replica | Lead approves each use |

## Why the database user matters more than the MCP flag

- Read-only flags are implemented by each MCP server and can have gaps (for example, Supabase's
  read-only mode covers SQL but some project-management tools are separate), bugs, or be switched
  off by editing one line of config.
- A database user without write grants can't write, whatever the agent, the MCP or a prompt
  injection hidden in the data tries.
- So: read-only database user **and** the MCP's read-only setting **and** a non-production target.
- DBHub example: its read-only mode also runs queries in a read-only transaction, but a Postgres
  superuser can still reach the file system (`pg_read_file`, `COPY ... TO PROGRAM`). Never give an
  MCP a superuser or admin connection.

## DBHub setup (Postgres, MySQL)

`tools/mcp.mjs` creates `dbhub.toml` (git-ignored) with read-only mode and a row limit. Fill in the
read-only user's connection string:

```toml
[[sources]]
id = "dev"
dsn = "postgres://app_ai_read:<password>@localhost:5432/app_db?sslmode=disable"

[[tools]]
name = "execute_sql"
source = "dev"
readonly = true
max_rows = 200
```

## Create a read-only user

Ask the project's lead or DBA to run these on dev or staging. Use a long random password and store
it only in your local environment.

### Postgres (including Supabase direct connections, RDS, Neon)

```sql
CREATE ROLE app_ai_read WITH LOGIN PASSWORD '<long-random-password>';
GRANT CONNECT ON DATABASE app_db TO app_ai_read;
GRANT USAGE ON SCHEMA public TO app_ai_read;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ai_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_ai_read;
-- Extra guard: every session starts read-only.
ALTER ROLE app_ai_read SET default_transaction_read_only = on;
-- Stop runaway queries.
ALTER ROLE app_ai_read SET statement_timeout = '15s';
```

Repeat the `GRANT USAGE` / `GRANT SELECT` lines for each schema the agent needs.

### MySQL / MariaDB

```sql
CREATE USER 'app_ai_read'@'%' IDENTIFIED BY '<long-random-password>';
GRANT SELECT, SHOW VIEW ON app_db.* TO 'app_ai_read'@'%';
FLUSH PRIVILEGES;
```

Restrict the host (`'%'`) to the VPN or office range when you can.

### MongoDB

```javascript
use admin
db.createUser({
  user: "app_ai_read",
  pwd: "<long-random-password>",
  roles: [{ role: "read", db: "app_db" }]
})
```

In Atlas: Database Access, add a user with the built-in "Only read any database" role, or a custom
role with `find` on the one database. Also start the MCP server with `--readOnly`.

### Supabase

- Use the hosted MCP with `read_only=true` and `project_ref=<dev or staging project>` in the URL.
  Never connect it to the production project.
- Supabase's read-only mode runs SQL as a read-only Postgres user; it does not make every tool
  harmless. Scope to one non-production project.

### Firebase

- The Firebase MCP has **no read-only mode** and uses your own Firebase login, so it can do what
  you can do. Use it only with a dev Firebase project (`firebase use <dev-project>`), never a
  project with real users.
- Limit tools with `--only` to what the task needs (for example `firestore,auth`).

## Staging write access (the exception)

Allowed only when all of these are true:

- The developer says so for this session and this task (for example "seed test orders on staging").
- A separate `<app>_ai_staging_write` user is used, with write grants on the needed tables only and
  no `DROP`, `ALTER`, `TRUNCATE` or user/role management.
- A backup or snapshot exists from before the session.
- Schema changes go through a migration file in a PR, never through agent-run SQL.
- The write user's MCP entry is removed (or the user disabled) at the end of the session.

## Production incidents

When production data is needed to understand an incident:

1. The lead approves it and names the question to answer.
2. Connect to a **read replica** with `<app>_ai_prod_read` (SELECT only, statement timeout).
3. Query aggregates and IDs, not personal data (`count(*)`, statuses, timestamps). Never select
   names, emails, phones, addresses or payment fields.
4. Remove the MCP entry when the question is answered. Note what was queried in the incident card.

## Checklist before connecting a database

```
- [ ] Not production (or: lead-approved incident, read replica, read-only user)
- [ ] Database user has read-only grants (verified: an INSERT fails)
- [ ] MCP read-only setting on (DBHub `readonly = true` in dbhub.toml, MongoDB --readOnly, Supabase read_only=true)
- [ ] Scoped to one database / project
- [ ] No real customer data in the target
- [ ] Credentials in my environment only, not in any committed file
```
