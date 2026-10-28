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
