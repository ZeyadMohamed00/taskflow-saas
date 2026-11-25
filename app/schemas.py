from datetime import date, datetime
from typing import Literal, Generic, TypeVar
from pydantic import BaseModel, Field, ConfigDict

Status = Literal["todo", "doing", "done"]
Priority = Literal["low", "medium", "high"]
Role = Literal["admin", "manager", "member"]
T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class Credentials(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)
    name: str = ""


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OrgIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class OrgOut(BaseModel):
    id: int
    name: str
    role: str


class MemberIn(BaseModel):
    email: str
    role: Role = "member"


class MemberRoleIn(BaseModel):
    role: Role


class MemberOut(BaseModel):
    user_id: int
    email: str
    name: str
    role: str


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TeamOut(ORM):
    id: int
    org_id: int
    name: str


class TeamMemberIn(BaseModel):
    user_id: int


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    team_id: int | None = None


class ProjectOut(ORM):
    id: int
    org_id: int
    team_id: int | None
    name: str
    description: str


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: Priority = "medium"
    due_date: date | None = None
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: Status | None = None
    priority: Priority | None = None
    due_date: date | None = None
    assignee_id: int | None = None


class TaskOut(ORM):
    id: int
    project_id: int
    title: str
    description: str
    status: str
    priority: str
    due_date: date | None
    assignee_id: int | None
    created_by: int | None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(ORM):
    id: int
    task_id: int
    author_id: int
    body: str
    created_at: datetime


class NotificationOut(ORM):
    id: int
    task_id: int | None
    text: str
    read: bool
    created_at: datetime
