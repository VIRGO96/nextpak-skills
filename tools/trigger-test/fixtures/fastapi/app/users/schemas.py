from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    """What other people may see about a user: no email, hash or role."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
