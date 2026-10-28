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
