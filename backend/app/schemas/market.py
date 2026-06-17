from pydantic import BaseModel
from typing import List, Optional

from app.schemas.skill_forge import NativeSkillItem


class MarketSkillItem(BaseModel):
    id: str
    display_name: str = ""
    description: str = ""
    short_description: str = ""
    version: str = "1.0.0"
    tags: List[str] = []
    content_hash: str = ""
    source_scope: str = "personal"  # personal | team
    source_skill_id: str = ""
    source_team_id: Optional[str] = None
    publisher_id: str = ""
    publisher_name: str = ""
    status: str = "pending"  # pending | approved | rejected
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_note: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MarketListResponse(BaseModel):
    success: bool
    skills: List[MarketSkillItem] = []
    error: Optional[str] = None


class PublishRequest(BaseModel):
    skill_id: str


class PublishResponse(BaseModel):
    success: bool
    skill: Optional[MarketSkillItem] = None
    error: Optional[str] = None


class ReviewRequest(BaseModel):
    note: str = ""


class ReviewResponse(BaseModel):
    success: bool
    skill: Optional[MarketSkillItem] = None
    error: Optional[str] = None


class AcquireResponse(BaseModel):
    success: bool
    skill: Optional[NativeSkillItem] = None
    error: Optional[str] = None


class SimpleOkResponse(BaseModel):
    success: bool
    error: Optional[str] = None


# =========================================================================
# 平台管理员管理
# =========================================================================


class PlatformAdminItem(BaseModel):
    id: str
    username: str
    display_name: str = ""
    is_seed_user: bool = False


class PlatformAdminListResponse(BaseModel):
    success: bool
    admins: List[PlatformAdminItem] = []
    error: Optional[str] = None


class GrantAdminRequest(BaseModel):
    username: str


class GrantAdminResponse(BaseModel):
    success: bool
    admin: Optional[PlatformAdminItem] = None
    error: Optional[str] = None
