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
