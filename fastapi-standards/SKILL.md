---
name: fastapi-standards
description: Use when writing or changing code in a Python FastAPI backend - adding or fixing an API endpoint, router, service, repository, Pydantic schema, Depends, auth, role or ownership check, SQLAlchemy model, Alembic migration, settings, error handling, logging, pagination, file upload, webhook, payment or third-party API call, or pytest tests. Typical asks - add an API to cancel orders, create the users endpoint, add validation, protect this route with auth, create a migration, handle the webhook, add pagination, fix this 422 error. Keywords - FastAPI, Python API, Pydantic v2, SQLAlchemy 2, Alembic, pydantic-settings, uvicorn, async def, httpx. Not for Django, Flask, Node.js or frontend code.
metadata:
  author: NextPak AI Team
  version: 0.2.0
---

# FastAPI Standards

Follow these rules for every change in a FastAPI backend. Goal: code that passes
review and QA the first time.

## 0. Before writing code

1. Read the project's `AGENTS.md` / `CLAUDE.md` and any domain doc for the area you touch.
2. Look at 1-2 existing feature packages and **match their patterns**. If the project already uses
   something else (sync SQLAlchemy, SQLModel, Tortoise, structlog, loguru, 400 for validation errors...),
   keep using it. Never add a second library for the same job.
3. Check versions in `pyproject.toml` / `requirements*.txt`. These rules assume FastAPI 0.100+, Pydantic v2,
   SQLAlchemy 2.x. If the project is on Pydantic v1 (`class Config`, `orm_mode`), don't mix v2 syntax in.
4. The defaults below apply to new projects, or to code that has no pattern yet.

## CRITICAL: stay inside the ticket's scope

- **Never change an existing endpoint's response shape, status codes or error body** (e.g. wrapping a
  response in `{ "data": ... }`, switching 422 to 400, renaming fields). That breaks the frontend and
  mobile apps. New endpoints use the conventions below; old ones stay as they are unless the ticket says so.
- **Don't move, rename or delete existing files** to fit the structure below. New code goes in the new
  structure; refactoring old code is its own ticket.
- **Don't edit or delete existing Alembic migrations.** Schema changes are always a new migration.
- If a rule below would need a big change (new logger, async rewrite, new folder layout), do the minimum
  for the ticket and list the rest under "Follow-ups" in your summary.

## 1. Default stack (new projects)

| Job | Use |
|---|---|
| Framework | FastAPI + uvicorn, Python 3.11+, `Annotated[...]` style for params and `Depends` |
| Validation | Pydantic v2 (`ConfigDict`, `Field`, `StringConstraints`) |
| Settings | pydantic-settings `BaseSettings`, cached `get_settings()` |
| DB | SQLAlchemy 2.x (`Mapped`/`mapped_column`, `select()`), async engine; Alembic for migrations |
| Logging | stdlib `logging` + `dictConfig`, JSON via python-json-logger, request id via asgi-correlation-id |
| Auth | `HTTPBearer(auto_error=False)` + PyJWT, wrapped in a `get_current_user` dependency |
| Tests | pytest + httpx `AsyncClient(transport=ASGITransport(app))` + `app.dependency_overrides` |

Install `sqlalchemy[asyncio]` (async needs `greenlet`) plus the driver (`asyncpg`, `aiosqlite`).

## 2. Project structure (by feature)

```
app/
  main.py             # create_app(): middleware, handlers, routers, lifespan
  core/config.py      # Settings + get_settings()
  core/db.py          # engine, session factory, get_session, Base with naming convention
  core/security.py    # get_current_user, CurrentUser
  core/errors.py      # AppError subclasses + register_exception_handlers()
  core/logging.py     # configure_logging()
  <feature>/
    router.py         # APIRouter: params, Depends, response_model only
    schemas.py        # Pydantic request/response models
    service.py        # business logic + ownership checks; no Request/Response here
    repository.py     # SQLAlchemy queries only
    models.py         # SQLAlchemy ORM models
migrations/           # Alembic
tests/
```

Rules:
- Routers have no queries and no business logic. Services never touch `Request`. Only repositories build queries.
- `create_app()` builds the app so tests can create a fresh one. Don't put `uvicorn.run()` in `main.py` imports.

## 3. Validation (Pydantic v2)

- Every request body is a Pydantic model with `model_config = ConfigDict(extra="forbid")`, so unknown
  fields like `"owner_id"` or `"role"` are rejected (blocks mass assignment).
- Constrain every field: `StringConstraints(strip_whitespace=True, min_length=1, max_length=200)`,
  `Field(ge=1, le=100)`, `EmailStr`, `Literal[...]`/`Enum`. No bare unbounded `str` for user input.
- Path and query params are typed and bounded: `Annotated[int, Path(ge=1)]`, `Annotated[int, Query(le=100)]`.
- Separate models for input and output (`NoteCreate`, `NoteUpdate`, `NoteOut`). Never reuse the ORM model
  or one schema for both directions.
- PATCH: apply `model_dump(exclude_unset=True)`, and reject explicit `null` for non-nullable columns.
- Ownership fields (`owner_id`, `tenant_id`) come from the current user, **never** from the body.

## 4. Errors

- Raise `AppError` subclasses from services (`NotFoundError`, `ForbiddenError`, `UnauthorizedError`,
  `ConflictError`). Don't raise `HTTPException` deep inside services, and never return error dicts by hand.
- Register handlers once in `create_app()` for: `AppError`, `RequestValidationError`,
  Starlette's `HTTPException` (catches router 404/405 too), and `Exception` (unknown errors).
- One shape for every error:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "Note not found", "details": null, "request_id": "..." } }
  ```
- Validation errors: keep FastAPI's default **422** with code `VALIDATION_ERROR` and a `details` list of
  `{field, message}`. Malformed JSON (`json_invalid`) returns **400** `INVALID_JSON`. Never return `str(exc)`
  or the error's `input` value (it echoes passwords back).
- Unknown errors: log the full traceback, return 500 `INTERNAL_ERROR` with a generic message and the request id.
  Never send stack traces, SQL or exception text to the client.
- Status codes: 400 bad request/JSON, 401 not logged in, 403 not allowed, 404 not found, 409 conflict,
  422 validation, 429 rate limit, 500 unexpected. 401 responses include `WWW-Authenticate: Bearer`.

## 5. Dependencies, auth and ownership (IDOR)

- DB session and current user always come from `Depends`: `SessionDep`, `CurrentUser` (`Annotated` aliases).
  Never create a session or decode a token inside a route body.
- `get_current_user`: missing/invalid/expired token or inactive user → 401. Use `HTTPBearer(auto_error=False)`
  and raise your own 401 so the error shape is consistent.
- JWT: `jwt.decode(..., algorithms=[fixed list], options={"require": ["exp", "sub"]})`; add `audience=`/`issuer=`
  for tokens from an identity provider. Never `verify_signature: False`, never take the algorithm from the token,
  short-lived access tokens. Cookies holding tokens: `httponly`, `secure`, `samesite`.
- **Authorization on every resource**: load the record, then check the current user owns it (or has the
  role). Logged in is not enough. List endpoints filter by owner/tenant in the query itself.
- Default: other user's record → 403. If the spec says "don't reveal existence", use 404; follow the spec.
- **Admin/staff routes** need a role check too (`AdminUser` / `require_role("admin")`, or `dependencies=[...]` on
  the whole admin router). Hidden URL is not protection. Response fields a user may not see get a separate model.

## 6. Async rules (never block the event loop)

- `async def` route/dependency → **everything inside must be non-blocking**: `await` async drivers,
  `httpx.AsyncClient`, `asyncio.sleep`. One `requests.get()`, `time.sleep()`, sync DB call or big file read
  in an `async def` freezes every request on that worker.
- Must call a sync library (boto3, sync SDK)? Either make the route a plain `def` (FastAPI runs it in a
  threadpool) or wrap the call: `await run_in_threadpool(fn, ...)`.
- CPU-heavy work (PDFs, image processing, ML inference) goes to a worker/queue (Celery, RQ, arq), not the request.
- Never share one `AsyncSession` across concurrent tasks (`asyncio.gather`). One session per request/task.
- `BackgroundTasks` is only for small, losable work (send an email). Anything that must not be lost → a queue.

## 7. Database (SQLAlchemy 2 + Alembic)

- 2.0 style only: `Mapped[...]`, `mapped_column`, `select()`, `session.scalars()`. No legacy `session.query()`
  in new code.
- `async_sessionmaker(engine, expire_on_commit=False)`; one session per request via `get_session`.
- **Transactions**: the service commits once at the end of a unit of work. Multi-step writes that must
  succeed together share that one commit; on error nothing is committed. Don't commit inside repositories.
- **No N+1**: no query inside a loop over results. Eager-load relationships you return
  (`selectinload()` for lists, `joinedload()` for single many-to-one). Set `lazy="raise"` on relationships
  so a forgotten eager load fails in tests instead of silently running N queries.
- Lists: always `order_by` a unique column (plus your sort) so pages don't overlap.
- Set a `naming_convention` on `Base.metadata` so constraint names are stable in migrations.
- Every schema change = `alembic revision --autogenerate -m "..."`, then **read and fix** the generated file
  (autogenerate misses renames and some type changes), run `upgrade` and `downgrade` locally.
  Never `Base.metadata.create_all()` outside tests.
- Queries go through the ORM or bound parameters. Never build SQL with f-strings.

## 8. API conventions

- Prefix `/api/v1/...`, plural nouns, `APIRouter(prefix=..., tags=[...])` per feature.
- Every route declares `response_model` (or a return type) and the right `status_code` (201 on create,
  204 on delete). The response model is the allowlist of what leaves the server.
- Pagination is required on list endpoints: `page` (ge=1) and `size` (default 20, **max 100**), response
  `{ "items": [...], "total", "page", "size" }` (same shape as fastapi-pagination).
- `GET /healthz` (process alive); add `/readyz` that checks the DB if the deploy uses readiness probes.

## 9. Config, logging and security

- All settings live in one `Settings(BaseSettings)` class. Required values have **no default**, so a missing
  env var crashes at startup with a clear message. Secrets are `SecretStr`. Code reads `get_settings().x`,
  never `os.environ` directly. Every new variable goes in `.env.example` and the PR description.
- Logging: `logger = logging.getLogger(__name__)` in each module. **No `print()`** in committed code. JSON
  logs outside local dev, with `request_id` on every line. Reuse an incoming `X-Request-ID` header.
- Log an error once (in the 500 handler), not at every layer. Never log tokens, passwords, full request
  bodies or `Authorization` headers. Use `extra={...}` for fields, not string formatting of secrets.
- If the project has no logger setup: don't add one in a feature ticket; list it as a follow-up.
- CORS: explicit `allow_origins` list from settings. Never `["*"]` with `allow_credentials=True`.
- Disable `/docs` and `/openapi.json` in production (`openapi_url=None`) unless the API is public.
- No secrets, keys or real credentials in code, tests, fixtures or `.env.example`.
- Rate-limit login, signup, OTP and password reset (gateway or the project's limiter, e.g. slowapi).
- `pip-audit` (or the project's scanner) has no high/critical findings before merge.

## 9a. Webhooks, payments, uploads and outbound calls

- **Webhooks**: verify the signature on the raw bytes (`await request.body()`) with the provider SDK or
  `hmac.compare_digest`; reject old timestamps; fail closed if the secret is unset. Process each event id once
  (unique constraint) because providers retry; answer 2xx fast, slow work goes to a queue.
- **Payments / order creation**: support an `Idempotency-Key` header so a retry or double click can't charge twice.
- **Uploads**: allowlist content types, cap the size while reading, never use the client filename as a path,
  and set a body-size limit at the proxy (FastAPI has none). Starlette 1.3.1+.
- **Outbound HTTP**: one shared `httpx.AsyncClient` with an explicit timeout; handle timeouts and 5xx from the
  third party; validate what it returns. User-supplied URLs pass an SSRF check (no private/metadata IPs, no
  redirects). Code: [references/examples.md](references/examples.md).

## 10. Testing (write tests first)

1. Before implementing, write the test cases from the spec's acceptance criteria.
2. Run them and **watch them fail** for the right reason. Paste that failing output in your summary.
   No failing output = the step was skipped. "I wrote them alongside the code" does not count.
3. Implement until green.

Setup: httpx `AsyncClient` + `ASGITransport` with `@pytest.mark.anyio` (async DB) or `TestClient` (sync
project). Swap the DB session and other dependencies with `app.dependency_overrides`; clear it after each test.
Use a fresh test DB per test (or a rolled-back transaction). Mock only external services, not your own code.

Minimum per endpoint:
- Happy path (status, response shape, **internal fields absent**)
- Validation failure → 422 `VALIDATION_ERROR`; unknown field rejected; malformed JSON → 400
- No/invalid token → 401; other user's record → 403
- Not found → 404; list: pagination, max `size`, only own records; admin route as normal user → 403
- Any business rule from the spec (e.g. duplicate → 409)

## Definition of done (check before saying "done")

- [ ] Matches existing project patterns; no duplicate libraries added
- [ ] No existing endpoint's response shape or status codes changed; no files moved; no old migrations edited
- [ ] Request bodies use `extra="forbid"` and constrained types; separate in/out schemas
- [ ] Every route has `response_model`; no password hashes, tokens or internal fields in responses
- [ ] Ownership/role check on every resource endpoint and admin route; lists filtered by owner in the query
- [ ] Webhooks verify signatures and are idempotent; outbound calls have timeouts; uploads are size-capped
- [ ] No blocking calls inside `async def`
- [ ] Errors use the shared shape; malformed JSON, unknown routes and 500s return JSON with `request_id`
- [ ] List endpoints paginated with max size and stable ordering; no N+1 queries
- [ ] Schema changes have a reviewed Alembic migration that upgrades and downgrades
- [ ] New settings validated in `Settings` and added to `.env.example`; no `print()`, no secrets in logs
- [ ] Tests written first; failing output shown before implementation; all green now
- [ ] Lint/format (ruff or the project's tool), type check (if configured) and `pytest` pass (paste the output, don't just claim it)

## Red flags: stop and fix

- `session.execute(...)` or business logic inside a router function
- A request model without `extra="forbid"`, or `owner_id` / `role` accepted from the body
- An endpoint with `{id}` in the path that never checks who owns the record
- `requests`, `time.sleep`, or a sync DB session inside `async def`
- `return {"detail": str(e)}`, `except Exception: pass`, or a bare `except` that hides errors
- Returning an ORM object without `response_model`, or a list endpoint with no `limit`
- `os.environ[...]` outside `core/config.py`; a secret with a default value
- `jwt.decode` without `algorithms=`, or `verify_signature: False`; an `/admin` route with only `CurrentUser`
- A webhook handler that parses JSON before checking the signature; `httpx`/`requests` call with no timeout
- A query inside a `for` loop over results
- "Tests pass" without showing the command output

## Reference code

Working, tested templates for every rule above: [references/examples.md](references/examples.md).
Read it when creating a new project or adding a piece that doesn't exist yet.
