"""Tests run against a REAL PostgreSQL. Order of preference:
1. TEST_DATABASE_URL env var (e.g. the docker-compose db)
2. a throwaway embedded PostgreSQL started by the `pgserver` package (pip install pgserver)
3. SQLite fallback (a warning is printed; Postgres-specific behaviour is then untested)"""

import os
import tempfile
import warnings

_server = None
url = os.getenv("TEST_DATABASE_URL")
if not url:
    try:
        import pgserver

        _server = pgserver.get_server(tempfile.mkdtemp())
        url = _server.get_uri().replace("postgresql://", "postgresql+psycopg2://", 1)
    except Exception as e:  # pragma: no cover
        warnings.warn(f"pgserver unavailable ({e}); falling back to SQLite")
        url = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["DATABASE_URL"] = url

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return TestClient(app)


def pytest_report_header(config):
    return f"database: {engine.dialect.name}"


def pytest_sessionfinish(session, exitstatus):
    if _server:
        _server.cleanup()


def signup(client, email, name=""):
    r = client.post(
        "/auth/register", json={"email": email, "password": "password123", "name": name}
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def uid(client, h):
    return client.get("/me", headers=h).json()["id"]


@pytest.fixture()
def org(client):
    """admin A owns org Acme; manager M, member B, member C(second member) belong to it."""
    a = signup(client, "a@x.com", "Ann")
    o = client.post("/orgs", json={"name": "Acme"}, headers=a).json()
    users = {"admin": a}
    for key, role in [("manager", "manager"), ("member", "member"), ("member2", "member")]:
        h = signup(client, f"{key}@x.com", key)
        assert (
            client.post(
                f"/orgs/{o['id']}/members", json={"email": f"{key}@x.com", "role": role}, headers=a
            ).status_code
            == 201
        )
        users[key] = h
    p = client.post(
        f"/orgs/{o['id']}/projects", json={"name": "Website"}, headers=users["manager"]
    ).json()
    return {"org": o, "project": p, "u": users}
