from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Dict, List, Optional


class ProjectCreateRequest(BaseModel):
    name: str
    description: str = ""


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class UserSkillDeploymentInfo(BaseModel):
    id: str
    user_id: str
    project_id: str
    team_skill_id: str
    skill_name: str
    tool_type: str
    deploy_path: str
    install_path: str
    repo_version: int = 1
    repo_hash: str = ""
    installed_hash: str = ""
    status: str = "synced"
    tracking_enabled: bool = True
    local_dirty: bool = False
    last_seen_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectSkillInfo(BaseModel):
    skill_id: str
    display_name: str = ""
    description: str = ""
    version: int = 1
    content_hash: str = ""
    last_modified_by: str = ""
    updated_at: Optional[str] = None
    deployment: Optional[UserSkillDeploymentInfo] = None


class SkillDeployRequest(BaseModel):
    tool_type: str
    # 全局部署（scope=platform）落本机 ~/.{tool}/skills，不需要项目路径，故可空。
    deploy_path: str = ""
    overwrite: bool = False
    # "project"=项目级（带跟踪同步）；"platform"=全局级（落本机平台目录，不跟踪）。
    scope: str = "project"


class SkillDeploymentResponse(BaseModel):
    success: bool
    deployment: Optional[UserSkillDeploymentInfo] = None
    deployed: List[Dict[str, str]] = []
    error: Optional[str] = None


class PushDeploymentResponse(BaseModel):
    success: bool
    no_change: bool = False
    status: Optional[str] = None
    conflict: bool = False
    change_items: List[Dict[str, Any]] = []
    diff_summary: str = ""
    deployment: Optional[UserSkillDeploymentInfo] = None
    # 本次推送若创建了版本快照，回传该版本（含 seq），供前端提示"已创建版本 vN"。
    version: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class DeploymentLocalStatusResponse(BaseModel):
    success: bool
    exists: bool = False
    has_local_changes: bool = False
    installed_hash: str = ""
    current_hash: str = ""
    status: str = ""
    error: Optional[str] = None


class PullUpdateRequest(BaseModel):
    overwrite: bool = False


class PullUpdateResponse(BaseModel):
    success: bool
    conflict: bool = False
    deployment: Optional[UserSkillDeploymentInfo] = None
    error: Optional[str] = None


class ProjectInfo(BaseModel):
    id: str
    team_id: str
    name: str
    description: str
    created_by: str
    skill_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectDetailResponse(BaseModel):
    success: bool
    project: Optional[ProjectInfo] = None
    skills: List[ProjectSkillInfo] = []
    error: Optional[str] = None


class ProjectResponse(BaseModel):
    success: bool
    project: Optional[ProjectInfo] = None
    error: Optional[str] = None


class ProjectListResponse(BaseModel):
    success: bool
    projects: List[ProjectInfo] = []
    error: Optional[str] = None


class SyncStatusItem(BaseModel):
    skill_id: str
    version: int
    content_hash: str
    updated_at: Optional[str] = None


class SyncStatusResponse(BaseModel):
    success: bool
    skills: List[SyncStatusItem] = []
    error: Optional[str] = None


class ChangeLogItem(BaseModel):
    id: str
    skill_id: str
    user_id: str
    user_display_name: str = ""
    skill_display_name: str = ""
    action: str
    version: int
    diff_summary: str = ""
    change_items: List[Dict[str, Any]] = []
    created_at: Optional[str] = None


class SyncChangesResponse(BaseModel):
    success: bool
    changes: List[ChangeLogItem] = []
    error: Optional[str] = None


class SyncPullRequest(BaseModel):
    skill_ids: List[str]


class SyncPullItem(BaseModel):
    skill_id: str
    config: Dict[str, Any] = {}
    vibeh_content: str = ""
    version: int = 0
    content_hash: str = ""


class SyncPullResponse(BaseModel):
    success: bool
    skills: List[SyncPullItem] = []
    error: Optional[str] = None


# =========================================================================
# 方案 B · M4 云端编排端点 DTO（镜像 contracts/local-agent-api.md §9）
#
# 约定：请求体同时接受 camelCase（契约口径，前端编排默认）与 snake_case（后端
# 既有口径）——`populate_by_name=True` + camelCase alias。响应体：
#   - build-artifact 为全新产物端点，**输出 camelCase**（与契约 TS interface 一致）；
#   - register-deployment / commit-pull / push 复用既有 snake_case 响应 schema
#     （契约 §9 注：「保持响应体不变，仅入参从路径改为内容/hash」）。
# =========================================================================


class FilePayloadIn(BaseModel):
    """本地代理 read-folder 上传的单个文件载荷（M0 §4.5 / 契约 FilePayload）。"""

    path: str
    encoding: str = "utf8"  # "utf8" | "base64"
    content: str = ""


class CloudResourceItem(BaseModel):
    """随构建产物下发的资源清单项（契约 CloudResourceItem，补 M0 §2.4 缺口）。"""

    model_config = ConfigDict(populate_by_name=True)

    path: str
    transfer: str = "inline"  # "inline"（默认）| "url"（预留）
    encoding: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    sha256: Optional[str] = None
    size: Optional[int] = None


class BuildArtifactRequest(BaseModel):
    """① 构建产物端点请求：POST /projects/{pid}/skills/{sid}/build-artifact。"""

    model_config = ConfigDict(populate_by_name=True)

    tool: str  # cursor | codex


class BuildArtifactResponse(BaseModel):
    """① 构建产物（不写盘、不登记）——契约 BuildArtifactResponse（camelCase 输出）。"""

    model_config = ConfigDict(populate_by_name=True)

    success: bool
    skill_id: str = Field(default="", serialization_alias="skillId")
    tool: str = ""
    contents: Dict[str, str] = {}
    resources: List[CloudResourceItem] = []
    repo_hash: str = Field(default="", serialization_alias="repoHash")
    repo_version: int = Field(default=0, serialization_alias="repoVersion")
    abstract_snapshot: Dict[str, Any] = Field(
        default_factory=dict, serialization_alias="abstractSnapshot"
    )
    error: Optional[str] = None


class RegisterDeploymentRequest(BaseModel):
    """④ 登记部署元数据请求（契约 RegisterDeploymentRequest）。

    installed_hash 为本地代理对 installPath 实算（权威）；repo_hash/repo_version/
    abstract_snapshot 来自先前 build-artifact 响应，前端透传。
    """

    model_config = ConfigDict(populate_by_name=True)

    tool: str
    deploy_path: str = Field(alias="deployPath")
    install_path: str = Field(alias="installPath")
    installed_hash: str = Field(alias="installedHash")
    repo_hash: str = Field(default="", alias="repoHash")
    repo_version: int = Field(default=1, alias="repoVersion")
    abstract_snapshot: Dict[str, Any] = Field(
        default_factory=dict, alias="abstractSnapshot"
    )
    overwrite: bool = False


class CommitPullRequest(BaseModel):
    """拉取提交请求（契约 CommitPullRequest）：覆盖写后本地代理算 installed_hash。"""

    model_config = ConfigDict(populate_by_name=True)

    installed_hash: str = Field(alias="installedHash")
    repo_hash: str = Field(default="", alias="repoHash")
    repo_version: int = Field(default=1, alias="repoVersion")
    abstract_snapshot: Dict[str, Any] = Field(
        default_factory=dict, alias="abstractSnapshot"
    )


class PushContentRequest(BaseModel):
    """推送（接收上传内容）请求（契约 PushDeploymentRequest）。

    current_hash 为本地代理实算，用于判定是否真有改动 + 作为新的 installed_hash；
    files 为本地代理 read-folder 上传的 install 目录全量文件（含二进制 base64）。
    """

    model_config = ConfigDict(populate_by_name=True)

    current_hash: str = Field(default="", alias="currentHash")
    files: List[FilePayloadIn] = []
    # 推送成功后是否创建一个新的版本快照（用户在"是否更新版本序列号"弹窗中选择）。
    create_version: bool = Field(default=False, alias="createVersion")
    version_label: str = Field(default="", alias="versionLabel")


class ResumeTrackingRequest(BaseModel):
    """恢复跟踪请求：对已停止跟踪的部署就地重启跟踪。

    installed_hash：编排（桌面）形态由前端经本地代理对 install_path 实算后上报；
    web 灰度形态可留空，由后端读盘计算。
    """

    model_config = ConfigDict(populate_by_name=True)

    installed_hash: Optional[str] = Field(default=None, alias="installedHash")
