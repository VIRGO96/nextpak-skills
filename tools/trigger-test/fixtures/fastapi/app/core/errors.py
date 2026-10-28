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
