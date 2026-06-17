from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from app.schemas.skill_forge import NativeSkillItem


class MarketSkillItem(BaseModel):
    id: str
    display_name: str = ""
    description: str = ""
    short_description: str = ""
    version: str = "1.0.0"
    tags: List[str] = []
    content_hash: str = ""
    # 介绍页信息（发布时填写，可 AI 辅助生成）
    intro_title: str = ""
    intro_author: str = ""
    intro_category: str = ""
    intro_md: str = ""
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
    # 发布表单填写的介绍页信息
    intro_title: str = ""
    intro_author: str = ""
    intro_category: str = ""
    intro_md: str = ""
    short_description: str = ""
    description: str = ""


class PublishResponse(BaseModel):
    success: bool
    skill: Optional[MarketSkillItem] = None
    error: Optional[str] = None


class IntroDraftRequest(BaseModel):
    skill_id: str


class IntroDraft(BaseModel):
    title: str = ""
    category: str = ""
    short_description: str = ""
    intro_md: str = ""


class IntroDraftResponse(BaseModel):
    success: bool
    draft: Optional[IntroDraft] = None
    error: Optional[str] = None


class MarketDetailResponse(BaseModel):
    success: bool
    id: str = ""
    config: Dict[str, Any] = {}
    vibeh_content: str = ""
    store_path: str = ""
    listing: Optional[MarketSkillItem] = None
    error: Optional[str] = None


class MarketResourceFileResponse(BaseModel):
    success: bool
    path: str = ""
    encoding: str = "utf8"
    content: str = ""
    size: int = 0
    is_binary: bool = False
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
