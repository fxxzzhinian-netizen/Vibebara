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
    # 介绍页信息（取自 Skill config.intro，发布时随快照带入）
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


class PublishResponse(BaseModel):
    success: bool
    skill: Optional[MarketSkillItem] = None
    # 本次是否为覆盖更新（再次推送已有条目）；False 表示首次发布。
    replaced: bool = False
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


# =========================================================================
# 历史版本（前一代版本）
# =========================================================================


class MarketVersionItem(BaseModel):
    id: str
    listing_id: str = ""
    seq: int = 0
    display_name: str = ""
    description: str = ""
    short_description: str = ""
    version: str = "1.0.0"
    tags: List[str] = []
    content_hash: str = ""
    intro_title: str = ""
    intro_author: str = ""
    intro_category: str = ""
    intro_md: str = ""
    status: str = "approved"
    published_by: Optional[str] = None
    published_at: Optional[str] = None
    created_at: Optional[str] = None


class MarketVersionListResponse(BaseModel):
    success: bool
    versions: List[MarketVersionItem] = []
    error: Optional[str] = None


class MarketVersionDetailResponse(BaseModel):
    success: bool
    id: str = ""
    config: Dict[str, Any] = {}
    vibeh_content: str = ""
    store_path: str = ""
    listing: Optional[MarketSkillItem] = None
    error: Optional[str] = None


class IntroUpdateRequest(BaseModel):
    intro_title: str = ""
    intro_author: str = ""
    intro_category: str = ""
    intro_md: str = ""


class IntroUpdateResponse(BaseModel):
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
