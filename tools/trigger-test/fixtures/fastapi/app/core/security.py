from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.db import SessionDep
from app.core.errors import UnauthorizedError
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
        # Always pass algorithms=[...]; never decode without verifying the signature.
        payload = jwt.decode(creds.credentials, s.jwt_secret.get_secret_value(), algorithms=[s.jwt_algorithm])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise UnauthorizedError("Invalid or expired token") from None
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid or expired token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
