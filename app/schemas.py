from typing import Literal
from pydantic import BaseModel, Field

Status = Literal["todo", "doing", "done"]
Role = Literal["owner", "member", "viewer"]


class Credentials(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class WorkspaceOut(BaseModel):
    id: int
    name: str
    role: str


class MemberIn(BaseModel):
    email: str
    role: Role = "member"


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProjectOut(BaseModel):
    id: int
    workspace_id: int
    name: str


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Status | None = None
    assignee_id: int | None = None


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    status: str
    assignee_id: int | None
