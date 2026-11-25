from .conftest import uid


def mk_task(client, org, who="manager", **kw):
    r = client.post(f"/projects/{org['project']['id']}/tasks", json={"title": "T", **kw}, headers=org["u"][who])
    assert r.status_code == 201, r.text
    return r.json()


def test_only_admin_manages_members_and_roles(client, org):
    oid = org["org"]["id"]
    u = org["u"]
    assert client.post(f"/orgs/{oid}/members", json={"email": "a@x.com"}, headers=u["manager"]).status_code == 403
    mid = uid(client, u["member"])
    assert client.patch(f"/orgs/{oid}/members/{mid}", json={"role": "manager"}, headers=u["manager"]).status_code == 403
    assert client.patch(f"/orgs/{oid}/members/{mid}", json={"role": "manager"}, headers=u["admin"]).status_code == 200


def test_cannot_remove_last_admin(client, org):
    oid = org["org"]["id"]
    aid = uid(client, org["u"]["admin"])
    assert client.patch(f"/orgs/{oid}/members/{aid}", json={"role": "member"}, headers=org["u"]["admin"]).status_code == 409


def test_members_cannot_create_projects_or_teams(client, org):
    oid = org["org"]["id"]
    m = org["u"]["member"]
    assert client.post(f"/orgs/{oid}/projects", json={"name": "x"}, headers=m).status_code == 403
    assert client.post(f"/orgs/{oid}/teams", json={"name": "x"}, headers=m).status_code == 403
    assert client.post(f"/orgs/{oid}/teams", json={"name": "Dev"}, headers=org["u"]["manager"]).status_code == 201


def test_only_admin_deletes_project(client, org):
    pid = org["project"]["id"]
    assert client.delete(f"/projects/{pid}", headers=org["u"]["manager"]).status_code == 403
    assert client.delete(f"/projects/{pid}", headers=org["u"]["admin"]).status_code == 204


def test_member_can_create_task_but_only_assign_to_self(client, org):
    u = org["u"]
    other = uid(client, u["member2"])
    me = uid(client, u["member"])
    r = client.post(f"/projects/{org['project']['id']}/tasks", json={"title": "x", "assignee_id": other}, headers=u["member"])
    assert r.status_code == 403
    assert mk_task(client, org, "member", assignee_id=me)["assignee_id"] == me


def test_member_edits_only_own_tasks(client, org):
    u = org["u"]
    mine = mk_task(client, org, "manager", assignee_id=uid(client, u["member"]))
    theirs = mk_task(client, org, "manager", assignee_id=uid(client, u["member2"]))
    assert client.patch(f"/tasks/{mine['id']}", json={"status": "doing"}, headers=u["member"]).json()["status"] == "doing"
    assert client.patch(f"/tasks/{theirs['id']}", json={"status": "doing"}, headers=u["member"]).status_code == 403
    assert client.patch(f"/tasks/{theirs['id']}", json={"status": "doing"}, headers=u["manager"]).status_code == 200


def test_member_cannot_reassign_or_delete(client, org):
    u = org["u"]
    t = mk_task(client, org, "manager", assignee_id=uid(client, u["member"]))
    assert client.patch(f"/tasks/{t['id']}", json={"assignee_id": uid(client, u["member2"])}, headers=u["member"]).status_code == 403
    assert client.delete(f"/tasks/{t['id']}", headers=u["member"]).status_code == 403
    assert client.delete(f"/tasks/{t['id']}", headers=u["manager"]).status_code == 204


def test_assignee_must_belong_to_org(client, org):
    from .conftest import signup
    stranger = signup(client, "s@x.com")
    r = client.post(f"/projects/{org['project']['id']}/tasks",
                    json={"title": "x", "assignee_id": uid(client, stranger)}, headers=org["u"]["manager"])
    assert r.status_code == 422
