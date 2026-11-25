from .conftest import uid, signup


def tasks_url(org):
    return f"/projects/{org['project']['id']}/tasks"


def test_validation(client, org):
    h = org["u"]["manager"]
    assert client.post(tasks_url(org), json={"title": ""}, headers=h).status_code == 422
    assert client.post(tasks_url(org), json={"title": "x", "priority": "urgent"}, headers=h).status_code == 422
    t = client.post(tasks_url(org), json={"title": "x"}, headers=h).json()
    assert client.patch(f"/tasks/{t['id']}", json={"status": "weird"}, headers=h).status_code == 422


def test_pagination_search_filter(client, org):
    h = org["u"]["manager"]
    me = uid(client, h)
    for i in range(25):
        client.post(tasks_url(org), json={"title": f"Task {i}", "priority": "high" if i % 5 == 0 else "low",
                                          "assignee_id": me if i < 3 else None}, headers=h)
    page1 = client.get(tasks_url(org) + "?size=10", headers=h).json()
    assert page1["total"] == 25 and len(page1["items"]) == 10 and page1["page"] == 1
    page3 = client.get(tasks_url(org) + "?size=10&page=3", headers=h).json()
    assert len(page3["items"]) == 5
    assert client.get(tasks_url(org) + "?q=task 2", headers=h).json()["total"] == 6  # Task 2, 20-24
    assert client.get(tasks_url(org) + "?priority=high", headers=h).json()["total"] == 5
    assert client.get(tasks_url(org) + f"?assignee_id={me}", headers=h).json()["total"] == 3
    assert client.get(tasks_url(org) + "?size=0", headers=h).status_code == 422
    assert client.get(tasks_url(org) + "?size=101", headers=h).status_code == 422


def test_status_filter(client, org):
    h = org["u"]["manager"]
    t = client.post(tasks_url(org), json={"title": "a"}, headers=h).json()
    client.post(tasks_url(org), json={"title": "b"}, headers=h)
    client.patch(f"/tasks/{t['id']}", json={"status": "done"}, headers=h)
    assert client.get(tasks_url(org) + "?status=done", headers=h).json()["total"] == 1


def test_comments_and_notifications(client, org):
    u = org["u"]
    ann, bob = u["manager"], u["member"]
    t = client.post(tasks_url(org), json={"title": "Fix bug", "assignee_id": uid(client, bob)}, headers=ann).json()
    # assignment notifies the assignee (not the actor)
    n = client.get("/notifications?unread=true", headers=bob).json()
    assert [x["text"] for x in n] == ["You were assigned: Fix bug"]
    assert client.get("/notifications", headers=ann).json() == []
    # a comment by the assignee notifies the creator
    c = client.post(f"/tasks/{t['id']}/comments", json={"body": "on it"}, headers=bob)
    assert c.status_code == 201
    assert client.post(f"/tasks/{t['id']}/comments", json={"body": ""}, headers=bob).status_code == 422
    assert [x["text"] for x in client.get("/notifications", headers=ann).json()] == ["New comment on: Fix bug"]
    assert len(client.get(f"/tasks/{t['id']}/comments", headers=ann).json()) == 1
    # mark read, and only the owner can
    nid = n[0]["id"]
    assert client.post(f"/notifications/{nid}/read", headers=ann).status_code == 404
    assert client.post(f"/notifications/{nid}/read", headers=bob).status_code == 204
    assert client.get("/notifications?unread=true", headers=bob).json() == []


def test_comments_blocked_for_outsiders(client, org):
    t = client.post(tasks_url(org), json={"title": "x"}, headers=org["u"]["manager"]).json()
    out = signup(client, "evil@x.com")
    assert client.post(f"/tasks/{t['id']}/comments", json={"body": "hi"}, headers=out).status_code == 404


def test_teams(client, org):
    oid, h = org["org"]["id"], org["u"]["manager"]
    team = client.post(f"/orgs/{oid}/teams", json={"name": "Dev"}, headers=h).json()
    mid = uid(client, org["u"]["member"])
    assert client.post(f"/orgs/{oid}/teams/{team['id']}/members", json={"user_id": mid}, headers=h).status_code == 201
    assert client.post(f"/orgs/{oid}/teams/{team['id']}/members", json={"user_id": mid}, headers=h).status_code == 409
    p = client.post(f"/orgs/{oid}/projects", json={"name": "P2", "team_id": team["id"]}, headers=h)
    assert p.status_code == 201 and p.json()["team_id"] == team["id"]
    assert client.post(f"/orgs/{oid}/projects", json={"name": "P3", "team_id": 9999}, headers=h).status_code == 422


def test_project_list_search_and_pagination(client, org):
    oid, h = org["org"]["id"], org["u"]["manager"]
    for i in range(5):
        client.post(f"/orgs/{oid}/projects", json={"name": f"Alpha {i}"}, headers=h)
    r = client.get(f"/orgs/{oid}/projects?q=alpha&size=2&page=2", headers=h).json()
    assert r["total"] == 5 and len(r["items"]) == 2


def test_dashboard(client, org):
    from datetime import date, timedelta
    h = org["u"]["manager"]
    me = uid(client, h)
    past = (date.today() - timedelta(days=3)).isoformat()
    a = client.post(tasks_url(org), json={"title": "a", "due_date": past, "assignee_id": me}, headers=h).json()
    b = client.post(tasks_url(org), json={"title": "b", "due_date": past}, headers=h).json()
    client.post(tasks_url(org), json={"title": "c"}, headers=h)
    client.patch(f"/tasks/{b['id']}", json={"status": "done"}, headers=h)
    d = client.get(f"/orgs/{org['org']['id']}/dashboard", headers=h).json()
    assert (d["todo"], d["doing"], d["done"], d["total"], d["percent_done"]) == (2, 0, 1, 3, 33)
    assert d["overdue"] == 1 and d["assigned_to_me"] == 1  # b is done so not overdue
    assert d["projects"] == [{"project_id": org["project"]["id"], "name": "Website", "total": 3, "done": 1}]
    assert a["id"]
