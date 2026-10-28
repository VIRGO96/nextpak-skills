# FastAPI: pytest + TestClient

Same feature as the Node example (notes, title 1-200 chars, owner-only reads). Tests first, RED
against an empty `FastAPI()`, then implemented.

Setup: `pip install fastapi httpx pytest`, run with `python -m pytest -q` from the project root
(`python -m` puts the root on `sys.path` so `from app.main import ...` works).

Notes:
- FastAPI returns **422** for validation errors by default. Keep the project's existing status code; don't
  remap to 400 inside a feature ticket.
- `TestClient` is sync and fine for most apps. For async tests use `httpx.AsyncClient` with
  `ASGITransport(app=app)` and the anyio pytest plugin (`@pytest.mark.anyio`) or `pytest-asyncio`.
- Override real auth in tests with `app.dependency_overrides[get_current_user] = ...` when the
  project has a real auth dependency; the example uses a test-only token format instead.
- Recent Starlette versions print a deprecation warning about `httpx` in `TestClient`. It does not
  affect results; follow your project's pinned versions.

### `tests/test_notes.py`

```python
# Acceptance criteria -> test cases. Written before the routes existed.
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    # Fresh app (and fresh in-memory store) per test = isolated tests.
    with TestClient(create_app()) as c:
        yield c


def as_user(user_id: str) -> dict:
    return {"Authorization": f"Bearer test-{user_id}"}


def test_create_note_returns_201(client):
    res = client.post("/api/v1/notes", json={"title": "Hi"}, headers=as_user("a"))
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["title"] == "Hi"
    assert data["owner_id"] == "a"


@pytest.mark.parametrize(
    "body",
    [{}, {"title": ""}, {"title": 123}, {"title": "x" * 201}],
    ids=["missing", "empty", "wrong-type", "too-long"],
)
def test_invalid_title_returns_422(client, body):
    res = client.post("/api/v1/notes", json=body, headers=as_user("a"))
    assert res.status_code == 422  # FastAPI's standard validation status


def test_malformed_json_returns_422(client):
    res = client.post(
        "/api/v1/notes",
        content='{"title":',
        headers={**as_user("a"), "Content-Type": "application/json"},
    )
    assert res.status_code == 422


def test_no_token_returns_401(client):
    res = client.post("/api/v1/notes", json={"title": "Hi"})
    assert res.status_code == 401


def test_other_users_note_returns_403(client):
    note_id = client.post("/api/v1/notes", json={"title": "A"}, headers=as_user("a")).json()["data"]["id"]
    res = client.get(f"/api/v1/notes/{note_id}", headers=as_user("b"))
    assert res.status_code == 403


def test_unknown_note_returns_404(client):
    res = client.get("/api/v1/notes/does-not-exist", headers=as_user("a"))
    assert res.status_code == 404
    assert res.json()["detail"] == "Note not found"  # generic 404 from a missing route would fail this
```

### RED: output before the routes existed

```text
FAILED tests/test_notes.py::test_create_note_returns_201 - assert 404 == 201
FAILED tests/test_notes.py::test_no_token_returns_401 - assert 404 == 401
FAILED tests/test_notes.py::test_other_users_note_returns_403 - KeyError: 'data'
...
9 failed
```

### GREEN

```text
9 passed
```

### `app/main.py`

```python
import uuid
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)  # reject extra fields and 123-as-title
    title: str = Field(min_length=1, max_length=200)


def current_user(authorization: Annotated[str | None, Header()] = None) -> str:
    # Test-only auth: "Bearer test-<userId>". Real apps verify a JWT/session here.
    if not authorization or not authorization.startswith("Bearer test-"):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.removeprefix("Bearer test-")


def create_app() -> FastAPI:
    app = FastAPI()
    notes: dict[str, dict] = {}  # per-app store keeps tests isolated
    User = Annotated[str, Depends(current_user)]

    @app.post("/api/v1/notes", status_code=201)
    def create_note(body: NoteIn, user_id: User):
        note = {"id": str(uuid.uuid4()), "title": body.title, "owner_id": user_id}
        notes[note["id"]] = note
        return {"data": note}

    @app.get("/api/v1/notes/{note_id}")
    def get_note(note_id: str, user_id: User):
        note = notes.get(note_id)
        if note is None:
            raise HTTPException(status_code=404, detail="Note not found")
        if note["owner_id"] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return {"data": note}

    return app
```
