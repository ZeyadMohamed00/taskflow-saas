def signup(client, email):
    r = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def setup_ws(client):
    a = signup(client, "a@x.com")
    w = client.post("/workspaces", json={"name": "Acme"}, headers=a).json()
    p = client.post(f"/workspaces/{w['id']}/projects", json={"name": "Site"}, headers=a).json()
    return a, w, p


def test_register_login_and_duplicate(client):
    signup(client, "a@x.com")
    assert client.post("/auth/register", json={"email": "a@x.com", "password": "password123"}).status_code == 409
    assert client.post("/auth/login", json={"email": "a@x.com", "password": "password123"}).status_code == 200
    assert client.post("/auth/login", json={"email": "a@x.com", "password": "wrongwrong"}).status_code == 401


def test_requires_auth(client):
    assert client.get("/workspaces").status_code == 401
    assert client.get("/workspaces", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_task_lifecycle_and_summary(client):
    a, w, p = setup_ws(client)
    t = client.post(f"/projects/{p['id']}/tasks", json={"title": "Design"}, headers=a).json()
    client.post(f"/projects/{p['id']}/tasks", json={"title": "Build"}, headers=a)
    r = client.patch(f"/tasks/{t['id']}", json={"status": "done"}, headers=a)
    assert r.json()["status"] == "done"
    s = client.get(f"/projects/{p['id']}/summary", headers=a).json()
    assert s == {"todo": 1, "doing": 0, "done": 1, "total": 2, "percent_done": 50}
    assert len(client.get(f"/projects/{p['id']}/tasks?status=done", headers=a).json()) == 1
    assert client.delete(f"/tasks/{t['id']}", headers=a).status_code == 204


def test_invalid_status_rejected(client):
    a, w, p = setup_ws(client)
    t = client.post(f"/projects/{p['id']}/tasks", json={"title": "x"}, headers=a).json()
    assert client.patch(f"/tasks/{t['id']}", json={"status": "weird"}, headers=a).status_code == 422


def test_tenant_isolation(client):
    a, w, p = setup_ws(client)
    b = signup(client, "b@x.com")
    assert client.get(f"/workspaces/{w['id']}/projects", headers=b).status_code == 404
    assert client.post(f"/projects/{p['id']}/tasks", json={"title": "hack"}, headers=b).status_code == 404
    assert client.get("/workspaces", headers=b).json() == []


def test_roles(client):
    a, w, p = setup_ws(client)
    b = signup(client, "b@x.com")
    assert client.post(f"/workspaces/{w['id']}/members", json={"email": "b@x.com", "role": "viewer"}, headers=a).status_code == 201
    assert client.get(f"/workspaces/{w['id']}/projects", headers=b).status_code == 200
    assert client.post(f"/projects/{p['id']}/tasks", json={"title": "x"}, headers=b).status_code == 403
    signup(client, "c@x.com")
    assert client.post(f"/workspaces/{w['id']}/members", json={"email": "c@x.com"}, headers=b).status_code == 403


def test_assignee_must_be_member(client):
    a, w, p = setup_ws(client)
    b = signup(client, "b@x.com")
    uid = client.get("/me", headers=b).json()["id"]
    r = client.post(f"/projects/{p['id']}/tasks", json={"title": "x", "assignee_id": uid}, headers=a)
    assert r.status_code == 422
