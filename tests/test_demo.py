from fastapi.testclient import TestClient
from app.main import app

def test_demo_creates_seeded_workspace():
    c = TestClient(app)
    tok = c.post("/auth/demo").json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    orgs = c.get("/orgs", headers=h).json()
    assert len(orgs) == 1 and "demo" in orgs[0]["name"].lower() and orgs[0]["role"] == "admin"
    projects = c.get(f"/orgs/{orgs[0]['id']}/projects", headers=h).json()
    assert projects["total"] == 2
