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
