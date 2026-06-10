from typing import List, Optional

from pydantic import BaseModel, Field


class GenerateInvitesRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=500)
    max_uses: int = Field(default=1, ge=1)
    # 过期天数；None / 0 = 永不过期
    expires_in_days: Optional[int] = Field(default=None, ge=0)
    note: str = ""


class InviteCodeItem(BaseModel):
    code: str
    note: str = ""
    max_uses: int = 1
    used_count: int = 0
    status: str = "active"  # active / exhausted / expired / disabled
    expires_at: Optional[str] = None
    created_at: Optional[str] = None


class GenerateInvitesResponse(BaseModel):
    success: bool
    codes: List[str] = []
    error: Optional[str] = None


class InviteListResponse(BaseModel):
    success: bool
    invites: List[InviteCodeItem] = []
    error: Optional[str] = None


class DisableInviteResponse(BaseModel):
    success: bool
    error: Optional[str] = None
