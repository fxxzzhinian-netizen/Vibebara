from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Dict, List, Optional


# =========================================================================
# 目录浏览
# =========================================================================

class BrowseRequest(BaseModel):
    path: str = ""


class DirEntry(BaseModel):
    name: str
    abs_path: str
    is_drive: bool = False


class BrowseResponse(BaseModel):
    success: bool
    current: str = ""
    parent: Optional[str] = None
    dirs: List[DirEntry] = []
    error: Optional[str] = None


# =========================================================================
# 外部 Skill 扫描 + 迁移（Dashboard 用）
# =========================================================================

class InstalledAtStatus(BaseModel):
    cursor: bool = False
    codex: bool = False
    windsurf: bool = False
    claude: bool = False


class UnifiedSkillPackage(BaseModel):
    id: str
    origin: str
    origin_confidence: str
    origin_signals: List[str] = []
    source_path: str
    name: str = ""
    display_name: str = ""
    description: str = ""
    short_description: str = ""
    has_scripts: bool = False
    has_references: bool = False
    has_assets: bool = False
    installed_at: InstalledAtStatus = InstalledAtStatus()


class ScanStatusResponse(BaseModel):
    status: str
    packages: List[UnifiedSkillPackage] = []
    scan_dir: str = ""
    last_scan: Optional[str] = None
    error: Optional[str] = None


class RescanRequest(BaseModel):
    scan_dir: Optional[str] = None


class MigrateRequest(BaseModel):
    source_path: str
    target_platform: str


class MigrateResponse(BaseModel):
    success: bool
    id: str = ""
    origin: str = ""
    adapted: bool = False
    target_platform: str = ""
    dest_path: str = ""
    error: Optional[str] = None


# =========================================================================
# Native Skill Store（平台原生 CRUD）
# =========================================================================

class NativeSkillItem(BaseModel):
    id: str
    display_name: str = ""
    description: str = ""
    short_description: str = ""
    version: str = "1.0.0"
    tags: List[str] = []
    imported_from: Optional[str] = None
    store_path: str = ""
    scope: str = "personal"
    team_id: Optional[str] = None
    owner_id: Optional[str] = None
    source_skill_id: Optional[str] = None
    content_hash: str = ""
    deployed_cursor: bool = False
    deployed_codex: bool = False
    deployed_windsurf: bool = False
    deployed_claude: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NativeSkillListResponse(BaseModel):
    success: bool
    skills: List[NativeSkillItem] = []
    error: Optional[str] = None


class NativeSkillDetailResponse(BaseModel):
    success: bool
    id: str = ""
    config: Dict[str, Any] = {}
    vibeh_content: str = ""
    store_path: str = ""
    db: Optional[NativeSkillItem] = None
    error: Optional[str] = None


class NativeSkillCreateRequest(BaseModel):
    config: Dict[str, Any]
    vibeh_content: Optional[str] = None


class NativeSkillUpdateRequest(BaseModel):
    partial: Dict[str, Any]
    vibeh_content: Optional[str] = None


class NativeSkillImportRequest(BaseModel):
    source_path: str
    origin: Optional[str] = None


class ImportContentFile(BaseModel):
    """import-content 上传的单个文件载荷（M0 §4.5 / 契约 FilePayload）。"""

    path: str
    encoding: str = "utf8"  # "utf8" | "base64"
    content: str = ""


class ImportContentRequest(BaseModel):
    """方案 B · M4：按 contents 导入（契约 ImportContentRequest）。

    POST /skill-forge/store/import-content —— 前端经本地代理 read-folder 读取本地
    skill 文件夹后上传 files[]，云端写临时目录后复用既有 import_from_external 解析。
    """

    model_config = ConfigDict(populate_by_name=True)

    files: List[ImportContentFile] = []
    origin: Optional[str] = None
    scope: Optional[str] = "personal"  # "personal" | "team"
    team_id: Optional[str] = Field(default=None, alias="teamId")


class NativeSkillBuildRequest(BaseModel):
    target: str = "all"


class NativeSkillDeployRequest(BaseModel):
    target: str
    dest_path: Optional[str] = None


class NativeSkillMutationResponse(BaseModel):
    success: bool
    skill: Optional[NativeSkillItem] = None
    error: Optional[str] = None
    no_change: bool = False
    diff_summary: str = ""
    change_items: List[Dict[str, Any]] = []


class NativeSkillDeployResponse(BaseModel):
    success: bool
    deployed: List[Dict[str, str]] = []
    error: Optional[str] = None


class NativeSkillPreviewResponse(BaseModel):
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
