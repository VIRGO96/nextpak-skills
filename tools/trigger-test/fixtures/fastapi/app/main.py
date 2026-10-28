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
