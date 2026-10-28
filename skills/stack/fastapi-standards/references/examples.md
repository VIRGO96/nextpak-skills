# Reference code (FastAPI + Pydantic v2 + SQLAlchemy 2 async + Alembic)

Copy and adapt. Each block matches a rule in `SKILL.md`. This code was run and its tests pass with
Python 3.11, FastAPI 0.162, Starlette 1.10, Pydantic 2.14, pydantic-settings 2.16, SQLAlchemy 2.1,
Alembic 1.20, PyJWT 2.15, python-json-logger 4.2, asgi-correlation-id 5.0, httpx 0.28, python-multipart 0.0.32,
pytest 9.1 (27 tests). Short snippets inside a section (route usage) show how to call the tested code.

```
pip install fastapi uvicorn "sqlalchemy[asyncio]" asyncpg alembic pydantic-settings pyjwt \
    python-json-logger asgi-correlation-id httpx python-multipart
pip install pytest httpx aiosqlite   # dev/test
```

Contents: .env.example, core/config, core/logging, core/errors, core/db, core/security, main.py,
feature package (models, schemas, repository, service, router), admin-only routes, webhooks + idempotency,
uploads, outbound HTTP + SSRF, sync code in async routes, Alembic, tests.

## Contents

- .env.example
- app/core/config.py
- app/core/logging.py
- app/core/errors.py
- app/core/db.py
- app/core/security.py
- app/main.py
- A feature package (notes)
- Admin-only routes (function-level authorization)
- app/core/webhooks.py (verify the signature on the raw body)
- app/core/uploads.py (size and type limits)
- app/core/http.py (outbound calls: timeouts and SSRF)
- Sync code inside async routes
- Alembic
- tests/conftest.py
- tests/test_notes.py (written before the code)
- tests/test_security_extras.py (JWT, admin, webhook, upload and SSRF checks)

## .env.example

```
APP_ENV=local
LOG_LEVEL=INFO
DATABASE_URL=postgresql+asyncpg://app:change-me@localhost:5432/app
JWT_SECRET=replace-with-32-plus-random-characters
# WEBHOOK_SECRET=only-if-this-service-receives-webhooks
CORS_ORIGINS=["http://localhost:3000"]
```

## app/core/config.py

```python
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["local", "test", "staging", "production"] = "local"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    database_url: str  # required: no default, so the app refuses to start without it
    jwt_secret: SecretStr = Field(min_length=32)  # SecretStr prints as '**********'
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"  # never "none" or a user-chosen value
    access_token_minutes: int = Field(default=30, ge=1, le=1440)
    cors_origins: list[str] = []  # JSON in env: CORS_ORIGINS='["https://app.example.com"]'
    webhook_secret: SecretStr | None = None  # only for services that receive webhooks; verifier fails closed

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"


@lru_cache
def get_settings() -> Settings:
    # Raises ValidationError listing every missing/invalid variable -> fail fast at startup.
    return Settings()
```

## app/core/logging.py

```python
import logging.config


def configure_logging(level: str = "INFO", json_logs: bool = True) -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                # Adds record.correlation_id (the request id) to every log record.
                "request_id": {"()": "asgi_correlation_id.CorrelationIdFilter", "default_value": "-"},
            },
            "formatters": {
                "json": {
                    "()": "pythonjsonlogger.json.JsonFormatter",
                    "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s %(correlation_id)s",
                    "rename_fields": {"levelname": "level", "asctime": "time", "correlation_id": "request_id"},
                },
                "text": {"format": "%(asctime)s %(levelname)s [%(correlation_id)s] %(name)s: %(message)s"},
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "filters": ["request_id"],
                    "formatter": "json" if json_logs else "text",
                },
            },
            "root": {"handlers": ["default"], "level": level},
            "loggers": {
                # Send uvicorn's logs through the same JSON handler instead of its own.
                "uvicorn": {"handlers": [], "propagate": True},
                "uvicorn.error": {"handlers": [], "propagate": True},
                "uvicorn.access": {"handlers": [], "propagate": True},
                "sqlalchemy.engine": {"level": "WARNING"},  # INFO logs every SQL statement
            },
        }
    )
```

## app/core/errors.py

```python
import logging

from asgi_correlation_id import correlation_id
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "Something went wrong"

    def __init__(self, message: str | None = None, details: object | None = None) -> None:
        self.message = message or self.message
        self.details = details
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code, code, message = 400, "BAD_REQUEST", "Bad request"


class PayloadTooLargeError(AppError):
    status_code, code, message = 413, "PAYLOAD_TOO_LARGE", "Payload too large"


class UnauthorizedError(AppError):
    status_code, code, message = 401, "UNAUTHORIZED", "Authentication required"


class ForbiddenError(AppError):
    status_code, code, message = 403, "FORBIDDEN", "You do not have access to this resource"


class NotFoundError(AppError):
    status_code, code, message = 404, "NOT_FOUND", "Resource not found"


class ConflictError(AppError):
    status_code, code, message = 409, "CONFLICT", "Resource already exists"


HTTP_CODES = {
    400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE", 429: "RATE_LIMITED",
}


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: object | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = correlation_id.get()
    body = {"error": {"code": code, "message": message, "details": details, "request_id": request_id}}
    headers = dict(headers or {})
    if request_id:
        # The 500 handler runs outside the request-id middleware, so set the header here too.
        headers["X-Request-ID"] = request_id
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("Application error", exc_info=exc)
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return error_response(exc.status_code, exc.code, exc.message, exc.details, headers)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        if any(e["type"] == "json_invalid" for e in errors):
            return error_response(400, "INVALID_JSON", "Malformed JSON body")
        # Never return str(exc) or e["input"]: they can echo passwords or tokens back.
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in errors]
        return error_response(422, "VALIDATION_ERROR", "Invalid request", details)

    # Register Starlette's class so router-level 404/405 are caught too.
    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return error_response(exc.status_code, code, str(exc.detail), headers=exc.headers)

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        # Full traceback goes to the logs; the client only gets a generic message + request id.
        logger.error("Unhandled error", exc_info=exc, extra={"path": request.url.path})
        return error_response(500, "INTERNAL_ERROR", "Something went wrong")
```

## app/core/db.py

```python
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

# Explicit constraint names so Alembic autogenerate is stable and downgrades work.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# create_async_engine does not connect yet, so creating it at import time is safe.
engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    # One session per request. Anything not committed is rolled back when the block exits.
    async with SessionFactory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
```

## app/core/security.py

```python
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.db import SessionDep
from app.core.errors import ForbiddenError, UnauthorizedError
from app.users.models import User

# auto_error=False: raise our own 401 so the error shape stays consistent.
bearer = HTTPBearer(auto_error=False)


def create_access_token(user_id: int) -> str:
    s = get_settings()
    exp = datetime.now(UTC) + timedelta(minutes=s.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, s.jwt_secret.get_secret_value(), s.jwt_algorithm)


async def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if creds is None:
        raise UnauthorizedError()
    s = get_settings()
    try:
        # Pin algorithms (never trust the token's header) and require exp, or a token without
        # an expiry is valid forever. Add audience=/issuer= when tokens come from an IdP.
        payload = jwt.decode(
            creds.credentials,
            s.jwt_secret.get_secret_value(),
            algorithms=[s.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise UnauthorizedError("Invalid or expired token") from None
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid or expired token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: str) -> Callable[[User], User]:
    """Function-level authorization (BFLA): put it on every admin/staff route or router."""

    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError()
        return user

    return checker


AdminUser = Annotated[User, Depends(require_role("admin"))]
# Whole router: APIRouter(prefix="/api/v1/admin", dependencies=[Depends(require_role("admin"))])
```

## app/main.py

```python
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.notes.router import router as notes_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()  # close pooled DB connections on shutdown


def create_app() -> FastAPI:
    settings = get_settings()  # invalid env -> crash here, before serving traffic
    configure_logging(settings.log_level, json_logs=settings.app_env != "local")

    app = FastAPI(
        title="Notes API",
        lifespan=lifespan,
        openapi_url="/openapi.json" if settings.docs_enabled else None,  # no public docs in prod
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,  # explicit allowlist, never ["*"] with credentials
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    # Added last = runs first: every request (and every log line) gets a request id.
    app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")

    register_exception_handlers(app)
    app.include_router(notes_router)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

Run: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (uvicorn handles SIGTERM with a graceful shutdown;
the lifespan then disposes the engine). Behind a proxy, `--proxy-headers` is already on but only trusts
`--forwarded-allow-ips` (default `127.0.0.1`): set it to the proxy's IP, never `*` on a public port,
or client IPs (rate limits, audit logs) will be wrong or spoofable.

## A feature package (notes)

### app/users/models.py and app/users/schemas.py

```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))  # never in a response model
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(default=True)
```

```python
from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    """What other people may see about a user: no email, hash or role."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
```

### app/notes/models.py

```python
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.users.models import User


class Note(Base):
    __tablename__ = "note"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # lazy="raise": a forgotten eager load fails loudly in tests instead of becoming N+1 queries
    # (and under asyncio an implicit lazy load would crash anyway).
    owner: Mapped[User] = relationship(lazy="raise")
```

### app/notes/schemas.py

```python
from datetime import datetime
from typing import Annotated, Generic, Self, TypeVar

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.users.schemas import UserPublic

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Body = Annotated[str, StringConstraints(max_length=10_000)]


class NoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")  # rejects "owner_id", "id", ... (mass assignment)

    title: Title
    body: Body = ""


class NoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    body: Body | None = None

    @model_validator(mode="after")
    def no_explicit_nulls(self) -> Self:
        # "Optional" in PATCH means "may be left out", not "may be set to null".
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    created_at: datetime
    owner: UserPublic


T = TypeVar("T")


class Page(BaseModel, Generic[T]):  # Python 3.12+: class Page[T](BaseModel)
    """Same shape as the fastapi-pagination library, so switching later is painless."""

    items: list[T]
    total: int
    page: int
    size: int
```

### app/notes/repository.py

```python
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.notes.models import Note


async def get(session: AsyncSession, note_id: int) -> Note | None:
    stmt = select(Note).where(Note.id == note_id).options(selectinload(Note.owner))
    return await session.scalar(stmt)


async def list_for_owner(session: AsyncSession, owner_id: int, *, offset: int, limit: int) -> tuple[list[Note], int]:
    base = select(Note).where(Note.owner_id == owner_id)
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await session.scalars(
        base.options(selectinload(Note.owner))  # one extra query for all owners, not one per row
        .order_by(Note.created_at.desc(), Note.id.desc())  # stable order, or pages overlap
        .offset(offset)
        .limit(limit)
    )
    return list(rows), total


def add(session: AsyncSession, note: Note) -> None:
    session.add(note)
```

### app/notes/service.py (ownership check and commit live here)

```python
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.notes import repository as repo
from app.notes.models import Note
from app.notes.schemas import NoteCreate, NoteUpdate
from app.users.models import User

logger = logging.getLogger(__name__)


def _assert_can_access(actor: User, note: Note) -> None:
    if actor.role != "admin" and note.owner_id != actor.id:
        raise ForbiddenError()


async def get_note(session: AsyncSession, actor: User, note_id: int) -> Note:
    note = await repo.get(session, note_id)
    if note is None:
        raise NotFoundError("Note not found")
    _assert_can_access(actor, note)  # logged in is not enough: check ownership
    return note


async def list_my_notes(session: AsyncSession, actor: User, *, page: int, size: int) -> tuple[list[Note], int]:
    return await repo.list_for_owner(session, actor.id, offset=(page - 1) * size, limit=size)


async def create_note(session: AsyncSession, actor: User, data: NoteCreate) -> Note:
    note = Note(**data.model_dump(), owner_id=actor.id)  # owner comes from the token, never the body
    repo.add(session, note)
    await session.commit()  # one commit per unit of work
    logger.info("note_created", extra={"note_id": note.id, "user_id": actor.id})
    return await get_note(session, actor, note.id)  # reload with owner eagerly loaded


async def update_note(session: AsyncSession, actor: User, note_id: int, data: NoteUpdate) -> Note:
    note = await get_note(session, actor, note_id)
    for field, value in data.model_dump(exclude_unset=True).items():  # PATCH: only sent fields
        setattr(note, field, value)
    await session.commit()
    return note
```

### app/notes/router.py

```python
from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.core.db import SessionDep
from app.core.security import CurrentUser
from app.notes import service
from app.notes.schemas import NoteCreate, NoteOut, NoteUpdate, Page

router = APIRouter(prefix="/api/v1/notes", tags=["notes"])

NoteId = Annotated[int, Path(ge=1)]


# Routes only: parse input, call the service, declare response_model. No queries here.
@router.get("", response_model=Page[NoteOut])
async def list_notes(
    session: SessionDep,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, total = await service.list_my_notes(session, user, page=page, size=size)
    return {"items": items, "total": total, "page": page, "size": size}


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(data: NoteCreate, session: SessionDep, user: CurrentUser):
    return await service.create_note(session, user, data)


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(note_id: NoteId, session: SessionDep, user: CurrentUser):
    return await service.get_note(session, user, note_id)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(note_id: NoteId, data: NoteUpdate, session: SessionDep, user: CurrentUser):
    return await service.update_note(session, user, note_id, data)
```

## Admin-only routes (function-level authorization)

`require_role` / `AdminUser` live in `app/core/security.py` above. Use them on every admin route, or once
on the whole admin router, so a normal user can't call `/admin/...` just by guessing the URL.

```python
@router.delete("/{user_id}", status_code=204)
async def deactivate_user(user_id: UserId, session: SessionDep, admin: AdminUser): ...

admin_router = APIRouter(prefix="/api/v1/admin", dependencies=[Depends(require_role("admin"))])
```

## app/core/webhooks.py (verify the signature on the raw body)

```python
import hashlib
import hmac
import time

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import BadRequestError

TOLERANCE_SECONDS = 300  # reject old timestamps so a captured request can't be replayed later


def sign(secret: str, timestamp: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()


async def verified_webhook_body(request: Request) -> bytes:
    """Dependency for webhook routes. Prefer the provider's SDK when it has one
    (e.g. stripe.Webhook.construct_event); this is the generic HMAC-SHA256 version."""
    secret = get_settings().webhook_secret
    if secret is None:  # fail closed: an unconfigured secret must not mean "accept everything"
        raise BadRequestError("Webhook signature cannot be verified")
    raw = await request.body()  # the RAW bytes: parsed and re-serialized JSON won't match the signature
    timestamp = request.headers.get("X-Webhook-Timestamp", "")
    signature = request.headers.get("X-Webhook-Signature", "")
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > TOLERANCE_SECONDS:
        raise BadRequestError("Invalid webhook timestamp")
    expected = sign(secret.get_secret_value(), timestamp, raw)
    if not hmac.compare_digest(expected, signature):  # constant time; never use ==
        raise BadRequestError("Invalid webhook signature")
    return raw
```

Webhook route rules: verify first, then process **idempotently**. Providers retry, so the same event
arrives more than once. Store the event id under a unique constraint and skip ids you've already seen;
answer 2xx fast and move slow work to a queue.

```python
@router.post("/webhooks/payments", include_in_schema=False)
async def payments_webhook(raw: Annotated[bytes, Depends(verified_webhook_body)], session: SessionDep):
    event = PaymentEvent.model_validate_json(raw)
    if await repo.event_seen(session, event.id):  # unique index on processed_event.event_id
        return {"status": "duplicate"}
    await service.handle_payment_event(session, event)  # marks the event seen in the same commit
    return {"status": "ok"}
```

Same idea for client calls that create payments or orders: accept an `Idempotency-Key` header, store
key + user + response, and return the stored response on a repeat instead of charging twice.

## app/core/uploads.py (size and type limits)

```python
from fastapi import UploadFile

from app.core.errors import BadRequestError, PayloadTooLargeError

CHUNK = 64 * 1024


async def read_limited(file: UploadFile, *, max_bytes: int, allowed_types: set[str]) -> bytes:
    """Read an upload with a hard size cap and a content-type allowlist.
    The client controls filename and content_type: never use the filename as a storage path,
    and check magic bytes too (e.g. the `filetype` package) for anything you open or serve back."""
    if file.content_type not in allowed_types:
        raise BadRequestError("File type not allowed")
    data = bytearray()
    while chunk := await file.read(CHUNK):
        data += chunk
        if len(data) > max_bytes:  # stop reading as soon as the cap is passed
            raise PayloadTooLargeError(f"File larger than {max_bytes} bytes")
    return bytes(data)
```

`UploadFile` needs `python-multipart`. Use Starlette 1.3.1 or newer (older versions ignored form limits
for urlencoded bodies, CVE-2026-54283). FastAPI has no global body-size limit: set one at the proxy
(nginx `client_max_body_size`, the load balancer, or the API gateway).

## app/core/http.py (outbound calls: timeouts and SSRF)

```python
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

from app.core.errors import BadRequestError

# One shared client (create it in lifespan, close it on shutdown). Always an explicit timeout:
# a slow third party must not hold your workers forever.
TIMEOUT = httpx.Timeout(10.0, connect=3.0)


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False)


async def assert_public_url(url: str) -> None:
    """SSRF guard for user-supplied URLs (webhook targets, "import from URL", avatars...).
    Blocks loopback, private ranges and cloud metadata (169.254.169.254). Redirects stay off,
    because a public URL can redirect to an internal one."""
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise BadRequestError("URL must be http(s)")
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, parts.hostname, parts.port or 443)
    except socket.gaierror:
        raise BadRequestError("URL host cannot be resolved") from None
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise BadRequestError("URL points to a private or internal address")
```

Create the client once in `lifespan` (`app.state.http = make_client()`, `await app.state.http.aclose()` on
shutdown) instead of one client per request. The DNS check has a small race (DNS rebinding); for strict
cases, send outbound traffic through an egress proxy that blocks private ranges.

## Sync code inside async routes

```python
from fastapi.concurrency import run_in_threadpool

@router.post("/{note_id}/export")
async def export_note(note_id: NoteId, session: SessionDep, user: CurrentUser):
    note = await service.get_note(session, user, note_id)
    # boto3 is blocking: run it in the threadpool instead of on the event loop.
    await run_in_threadpool(s3.put_object, Bucket=BUCKET, Key=f"notes/{note.id}.txt", Body=note.body)
    return {"status": "exported"}

# Or, if the whole route is sync work, declare it with plain `def` and FastAPI runs it in a thread.
```

## Alembic

```
alembic init -t async migrations
# alembic.ini: uncomment the dated file_template so files sort by date
alembic revision --autogenerate -m "create user and note"   # then READ and fix the file
alembic upgrade head && alembic downgrade -1 && alembic upgrade head
alembic check   # CI: fails if models and migrations disagree
```

```python
# migrations/env.py (after `alembic init -t async migrations`), replace `target_metadata = None` with:
from app.core.config import get_settings
from app.core.db import Base
import app.notes.models  # noqa: F401  (import every models module so autogenerate sees it)
import app.users.models  # noqa: F401

# "%" must be doubled for configparser (URL-encoded passwords contain it).
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
target_metadata = Base.metadata
```

## tests/conftest.py

```python
import os

# Test-only values, set before the app is imported so Settings() validates.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-at-least-32-characters-long")

from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.db import Base, get_session  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import create_app  # noqa: E402
from app.users.models import User  # noqa: E402


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    # Fresh in-memory DB per test. StaticPool keeps one connection so all sessions see the same DB.
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)  # tests only; real schema comes from Alembic
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def client(session_factory) -> AsyncIterator[AsyncClient]:
    app = create_app()

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    # raise_app_exceptions=False: let the 500 handler answer instead of re-raising into the test.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(session_factory):
    async def _make(email: str = "a@example.com", role: str = "user") -> User:
        async with session_factory() as session:
            user = User(email=email, name=email.split("@")[0], password_hash="x" * 60, role=role)
            session.add(user)
            await session.commit()
            return user

    return _make


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
```

## tests/test_notes.py (written before the code)

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from tests.conftest import auth

pytestmark = pytest.mark.anyio
URL = "/api/v1/notes"


async def test_create_note_returns_201_and_hides_internal_fields(client, make_user):
    user = await make_user()
    res = await client.post(URL, json={"title": "  First  ", "body": "hello"}, headers=auth(user))
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "First"  # whitespace stripped by the schema
    assert data["owner"] == {"id": user.id, "name": user.name}
    assert "password_hash" not in str(data) and "email" not in data["owner"]


async def test_unknown_field_is_rejected(client, make_user):
    user = await make_user()
    res = await client.post(URL, json={"title": "t", "owner_id": 999}, headers=auth(user))
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert err["details"][0]["field"] == "body.owner_id"


async def test_blank_title_is_rejected(client, make_user):
    user = await make_user()
    res = await client.post(URL, json={"title": "   "}, headers=auth(user))
    assert res.status_code == 422


async def test_malformed_json_returns_400(client, make_user):
    user = await make_user()
    res = await client.post(
        URL, content=b'{"title": "x",', headers={**auth(user), "Content-Type": "application/json"}
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_JSON"


async def test_missing_token_returns_401(client):
    res = await client.get(URL)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"
    assert res.headers["www-authenticate"] == "Bearer"


async def test_invalid_token_returns_401(client):
    res = await client.get(URL, headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


async def test_other_users_note_returns_403(client, make_user):
    alice, bob = await make_user("alice@example.com"), await make_user("bob@example.com")
    created = await client.post(URL, json={"title": "private"}, headers=auth(alice))
    note_id = created.json()["id"]

    res = await client.get(f"{URL}/{note_id}", headers=auth(bob))
    assert res.status_code == 403
    res = await client.patch(f"{URL}/{note_id}", json={"title": "hacked"}, headers=auth(bob))
    assert res.status_code == 403


async def test_admin_can_read_any_note(client, make_user):
    alice = await make_user("alice@example.com")
    admin = await make_user("admin@example.com", role="admin")
    note_id = (await client.post(URL, json={"title": "t"}, headers=auth(alice))).json()["id"]
    res = await client.get(f"{URL}/{note_id}", headers=auth(admin))
    assert res.status_code == 200


async def test_missing_note_returns_404(client, make_user):
    user = await make_user()
    res = await client.get(f"{URL}/12345", headers=auth(user))
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


async def test_non_integer_id_returns_422(client, make_user):
    user = await make_user()
    res = await client.get(f"{URL}/abc", headers=auth(user))
    assert res.status_code == 422


async def test_list_is_paginated_and_only_shows_own_notes(client, make_user):
    alice, bob = await make_user("alice@example.com"), await make_user("bob@example.com")
    for i in range(3):
        await client.post(URL, json={"title": f"a{i}"}, headers=auth(alice))
    await client.post(URL, json={"title": "b0"}, headers=auth(bob))

    res = await client.get(URL, params={"page": 1, "size": 2}, headers=auth(alice))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3 and body["page"] == 1 and body["size"] == 2
    assert len(body["items"]) == 2
    assert all(n["owner"]["id"] == alice.id for n in body["items"])

    res = await client.get(URL, params={"page": 2, "size": 2}, headers=auth(alice))
    assert len(res.json()["items"]) == 1


async def test_list_rejects_size_over_max(client, make_user):
    user = await make_user()
    res = await client.get(URL, params={"size": 101}, headers=auth(user))
    assert res.status_code == 422


async def test_patch_updates_only_sent_fields(client, make_user):
    user = await make_user()
    note = (await client.post(URL, json={"title": "t", "body": "keep"}, headers=auth(user))).json()
    res = await client.patch(f"{URL}/{note['id']}", json={"title": "new"}, headers=auth(user))
    assert res.status_code == 200
    assert res.json()["title"] == "new" and res.json()["body"] == "keep"


async def test_patch_rejects_explicit_null_for_required_column(client, make_user):
    user = await make_user()
    note = (await client.post(URL, json={"title": "t"}, headers=auth(user))).json()
    res = await client.patch(f"{URL}/{note['id']}", json={"title": None}, headers=auth(user))
    assert res.status_code == 422


async def test_unknown_route_returns_json_404(client):
    res = await client.get("/api/v1/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


async def test_request_id_is_echoed(client):
    rid = "0123456789abcdef0123456789abcdef"
    res = await client.get("/healthz", headers={"X-Request-ID": rid})
    assert res.status_code == 200
    assert res.headers["x-request-id"] == rid


async def test_unknown_error_returns_generic_500_without_stack_trace():
    app = create_app()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("db password is hunter2")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/boom")
    assert res.status_code == 500
    err = res.json()["error"]
    assert err["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in res.text and "Traceback" not in res.text
    assert err["request_id"] and res.headers["x-request-id"] == err["request_id"]
```

## tests/test_security_extras.py (JWT, admin, webhook, upload and SSRF checks)

```python
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
import pytest
from fastapi import Depends, UploadFile
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import BadRequestError
from app.core.http import assert_public_url
from app.core.security import AdminUser
from app.core.uploads import read_limited
from app.core.webhooks import sign, verified_webhook_body
from app.main import create_app
from tests.conftest import auth

pytestmark = pytest.mark.anyio
WEBHOOK_SECRET = "whsec-test-secret-value"


@pytest.fixture
async def extras_client(session_factory, monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET", WEBHOOK_SECRET)
    get_settings.cache_clear()
    app = create_app()

    @app.get("/api/v1/admin/stats")
    async def admin_stats(admin: AdminUser) -> dict[str, int]:
        return {"users": 1}

    @app.post("/webhooks/payments")
    async def payments_webhook(raw: Annotated[bytes, Depends(verified_webhook_body)]) -> dict[str, str]:
        return {"status": "received"}

    @app.post("/api/v1/avatar")
    async def upload_avatar(file: UploadFile) -> dict[str, int]:
        data = await read_limited(file, max_bytes=1024, allowed_types={"image/png"})
        return {"size": len(data)}

    async def override_get_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    get_settings.cache_clear()


async def test_token_without_exp_is_rejected(client, make_user):
    user = await make_user()
    s = get_settings()
    token = jwt.encode({"sub": str(user.id)}, s.jwt_secret.get_secret_value(), s.jwt_algorithm)
    res = await client.get("/api/v1/notes", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


async def test_expired_token_is_rejected(client, make_user):
    user = await make_user()
    s = get_settings()
    exp = datetime.now(UTC) - timedelta(minutes=1)
    token = jwt.encode({"sub": str(user.id), "exp": exp}, s.jwt_secret.get_secret_value(), s.jwt_algorithm)
    res = await client.get("/api/v1/notes", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


async def test_admin_route_forbidden_for_normal_user(extras_client, make_user):
    user = await make_user()
    admin = await make_user("admin@example.com", role="admin")
    assert (await extras_client.get("/api/v1/admin/stats", headers=auth(user))).status_code == 403
    assert (await extras_client.get("/api/v1/admin/stats", headers=auth(admin))).status_code == 200


async def test_webhook_accepts_valid_signature_and_rejects_tampering(extras_client):
    body = b'{"id":"evt_1","type":"payment.succeeded"}'
    ts = str(int(time.time()))
    headers = {"X-Webhook-Timestamp": ts, "X-Webhook-Signature": sign(WEBHOOK_SECRET, ts, body),
               "Content-Type": "application/json"}
    assert (await extras_client.post("/webhooks/payments", content=body, headers=headers)).status_code == 200

    tampered = body.replace(b"evt_1", b"evt_2")
    res = await extras_client.post("/webhooks/payments", content=tampered, headers=headers)
    assert res.status_code == 400

    old_ts = str(int(time.time()) - 3600)
    old = {**headers, "X-Webhook-Timestamp": old_ts, "X-Webhook-Signature": sign(WEBHOOK_SECRET, old_ts, body)}
    assert (await extras_client.post("/webhooks/payments", content=body, headers=old)).status_code == 400


async def test_upload_size_and_type_limits(extras_client):
    ok = await extras_client.post("/api/v1/avatar", files={"file": ("a.png", b"x" * 100, "image/png")})
    assert ok.status_code == 200 and ok.json() == {"size": 100}
    big = await extras_client.post("/api/v1/avatar", files={"file": ("a.png", b"x" * 2048, "image/png")})
    assert big.status_code == 413 and big.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    exe = await extras_client.post("/api/v1/avatar", files={"file": ("a.exe", b"MZ", "application/octet-stream")})
    assert exe.status_code == 400


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5", "file:///etc/passwd"]
)
async def test_ssrf_guard_blocks_internal_urls(url):
    with pytest.raises(BadRequestError):
        await assert_public_url(url)


async def test_ssrf_guard_allows_public_ip():
    await assert_public_url("https://8.8.8.8/")
```

`pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"
```

Note: SQLite keeps the sample fast. If the project uses Postgres features (JSONB, `ILIKE`, row locks),
run tests against Postgres (Docker or testcontainers) so they catch real behavior.
