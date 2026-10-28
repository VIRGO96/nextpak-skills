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
