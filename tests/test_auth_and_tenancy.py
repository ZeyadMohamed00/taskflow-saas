from .conftest import signup


def test_register_login_duplicate_and_validation(client):
    signup(client, "a@x.com")
    assert (
        client.post(
            "/auth/register", json={"email": "a@x.com", "password": "password123"}
        ).status_code
        == 409
    )
    assert (
        client.post("/auth/register", json={"email": "bad", "password": "password123"}).status_code
        == 422
    )
    assert (
        client.post("/auth/register", json={"email": "b@x.com", "password": "short"}).status_code
        == 422
    )
    assert (
        client.post("/auth/login", json={"email": "A@X.com", "password": "password123"}).status_code
        == 200
    )
    assert (
        client.post("/auth/login", json={"email": "a@x.com", "password": "wrongwrong"}).status_code
        == 401
    )


def test_requires_valid_token(client):
    assert client.get("/orgs").status_code == 401
    assert client.get("/orgs", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_tenant_isolation(client, org):
    outsider = signup(client, "evil@x.com")
    oid, pid = org["org"]["id"], org["project"]["id"]
    assert client.get("/orgs", headers=outsider).json() == []
    assert client.get(f"/orgs/{oid}/projects", headers=outsider).status_code == 404
    assert client.get(f"/orgs/{oid}/members", headers=outsider).status_code == 404
    assert client.get(f"/projects/{pid}/tasks", headers=outsider).status_code == 404
    assert (
        client.post(f"/projects/{pid}/tasks", json={"title": "x"}, headers=outsider).status_code
        == 404
    )
    assert client.get(f"/orgs/{oid}/dashboard", headers=outsider).status_code == 404


def test_two_orgs_do_not_leak_projects(client, org):
    b = signup(client, "other@x.com")
    o2 = client.post("/orgs", json={"name": "Other"}, headers=b).json()
    client.post(f"/orgs/{o2['id']}/projects", json={"name": "Secret"}, headers=b)
    names = [
        p["name"]
        for p in client.get(f"/orgs/{org['org']['id']}/projects", headers=org["u"]["admin"]).json()[
            "items"
        ]
    ]
    assert names == ["Website"]
