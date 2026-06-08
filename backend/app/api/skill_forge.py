from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.skill_forge import (
    BrowseRequest,
    BrowseResponse,
    ScanStatusResponse,
    RescanRequest,
    MigrateRequest,
    MigrateResponse,
)
from app.services.skill_forge_service import (
    browse_directory,
    SkillRegistry,
    migrate_skill_via_bridge,
)

api_router = APIRouter(prefix="/skill-forge", tags=["skill-forge"])

# 注意（M2 多租户复核）：本路由组的端点会触达「后端机器文件系统」（浏览盘符/
# 扫描目录/node 迁移本地文件），属 M0 §5.2 将下沉到本地代理的 B 类能力。
# 在迁移完成前，云端形态下必须至少要求登录鉴权，杜绝未授权遍历服务器磁盘。
# 前端经 apiClient 拦截器对全部请求自动附带 Bearer，故加鉴权对前端零改动。


@api_router.post("/browse", response_model=BrowseResponse)
async def browse(data: BrowseRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return await browse_directory(data.path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/packages", response_model=ScanStatusResponse)
async def get_packages(user_id: str = Depends(get_current_user_id)):
    return SkillRegistry.get_status()


@api_router.post("/rescan", response_model=ScanStatusResponse)
async def rescan(data: RescanRequest, user_id: str = Depends(get_current_user_id)):
    scan_dir = data.scan_dir or SkillRegistry._scan_dir
    if not scan_dir:
        raise HTTPException(status_code=400, detail="未指定扫描目录且无历史扫描目录")
    await SkillRegistry.rescan(scan_dir)
    return SkillRegistry.get_status()


@api_router.post("/migrate", response_model=MigrateResponse)
async def migrate(data: MigrateRequest, user_id: str = Depends(get_current_user_id)):
    if data.target_platform not in ("cursor", "codex", "windsurf", "claude", "kiro", "trae", "qoder"):
        raise HTTPException(status_code=400, detail="target_platform 必须是 cursor、codex、windsurf、claude、kiro、trae 或 qoder")
    try:
        result = await migrate_skill_via_bridge(data.source_path, data.target_platform)
        if result.get("success") and result.get("adapted"):
            await SkillRegistry.rescan(SkillRegistry._scan_dir)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
