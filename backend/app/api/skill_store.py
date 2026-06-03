import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.auth import get_current_user_id
from app.core.database import async_session_factory
from app.models.skill_package import SkillPackage
from app.models.team import TeamMember
from app.schemas.project import BuildArtifactRequest, BuildArtifactResponse
from app.schemas.skill_forge import (
    ImportContentRequest,
    NativeSkillListResponse,
    NativeSkillDetailResponse,
    NativeSkillCreateRequest,
    NativeSkillUpdateRequest,
    NativeSkillImportRequest,
    NativeSkillBuildRequest,
    NativeSkillDeployRequest,
    NativeSkillMutationResponse,
    NativeSkillDeployResponse,
    NativeSkillPreviewResponse,
)
from app.services import project_service
from app.services.native_skill_store import NativeSkillStore

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/skill-forge/store", tags=["skill-store"])


async def _user_team_ids(user_id: str) -> list[str]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember.team_id).where(TeamMember.user_id == user_id)
        )
        return list(result.scalars().all())


async def _assert_skill_accessible(skill_id: str, user_id: str) -> None:
    """归属守卫（M2 多租户补漏）。

    build / preview / complete 原先仅凭 skill_id 操作，缺少归属校验，存在跨用户
    读取/构建他人**私有 Skill** 产物或触发其 LLM 调用的越权风险（IDOR）。
    复用 NativeSkillStore.get_by_id(user_id=...) 的归属判定（personal 且非本人
    owner → 返回 None），口径与 get_skill 端点一致；不存在或无权一律拒绝。
    """
    detail = await NativeSkillStore.get_by_id(skill_id, user_id=user_id)
    if detail is None:
        raise PermissionError(f"Skill '{skill_id}' not found or access denied")


# LLM 测试（放在 /{skill_id} 之前避免路由冲突）
@api_router.get("/llm/test")
async def test_llm(user_id: str = Depends(get_current_user_id)):
    """测试 LLM API 连通性"""
    from app.services.llm_service import test_connection
    return await test_connection()


@api_router.get("/list", response_model=NativeSkillListResponse)
async def list_skills(
    scope: str = "personal",
    user_id: str = Depends(get_current_user_id),
):
    try:
        if scope == "team":
            team_ids = await _user_team_ids(user_id)
            skills = await NativeSkillStore.list_all(scope="team", team_ids=team_ids)
        else:
            skills = await NativeSkillStore.list_all(
                scope="personal", owner_id=user_id
            )
        return {"success": True, "skills": skills}
    except Exception as e:
        logger.exception("[store/list] 获取列表失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/{skill_id}", response_model=NativeSkillDetailResponse)
async def get_skill(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        detail = await NativeSkillStore.get_by_id(skill_id, user_id=user_id)
        if detail is None:
            return {"success": False, "error": f"Skill '{skill_id}' not found"}
        return {"success": True, **detail}
    except Exception as e:
        logger.exception(f"[store/get] {skill_id} 加载失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/create", response_model=NativeSkillMutationResponse)
async def create_skill(
    data: NativeSkillCreateRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        if "name" not in data.config:
            raise ValueError("config must contain 'name'")
        skill = await NativeSkillStore.create(
            data.config, data.vibeh_content, owner_id=user_id
        )
        return {"success": True, "skill": skill}
    except ValueError as e:
        logger.warning(f"[store/create] 参数错误: {e}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception("[store/create] 创建失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/{skill_id}", response_model=NativeSkillMutationResponse)
async def update_skill(
    skill_id: str, data: NativeSkillUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        # 团队（平台）仓库 Skill：任意团队成员均可编辑，非成员拒绝。
        async with async_session_factory() as session:
            row = await session.get(SkillPackage, skill_id)
        if row is not None and row.scope == "team":
            team_ids = await _user_team_ids(user_id)
            if row.team_id not in team_ids:
                return {
                    "success": False,
                    "error": "无权编辑该团队 Skill（非团队成员）",
                }

        result = await NativeSkillStore.update(
            skill_id, data.partial, vibeh_content=data.vibeh_content, user_id=user_id
        )
        return {
            "success": True,
            "skill": result.get("skill"),
            "no_change": result.get("no_change", False),
            "diff_summary": result.get("diff_summary", ""),
            "change_items": result.get("change_items", []),
        }
    except FileNotFoundError as e:
        logger.warning(f"[store/update] {skill_id} 不存在")
        return {"success": False, "error": str(e)}
    except PermissionError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/update] {skill_id} 更新失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        await NativeSkillStore.delete(skill_id, user_id=user_id)
        return {"success": True}
    except PermissionError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/delete] {skill_id} 删除失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/import", response_model=NativeSkillMutationResponse)
async def import_skill(
    data: NativeSkillImportRequest,
    user_id: str = Depends(get_current_user_id),
):
    """[一次性端点 · 灰度保留] 云端读 source_path（后端盘）解析导入，供 local 形态使用。"""
    try:
        skill = await NativeSkillStore.import_from_external(
            data.source_path, data.origin, owner_id=user_id
        )
        return {"success": True, "skill": skill}
    except Exception as e:
        logger.exception(f"[store/import] 导入失败: {data.source_path}")
        return {"success": False, "error": str(e)}


@api_router.post("/import-content", response_model=NativeSkillMutationResponse)
async def import_skill_content(
    data: ImportContentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """方案 B · M4 编排端点：按上传的 files[] 导入（薄代理，**云端不读后端盘**）。

    前端经本地代理 read-folder 读取本地 skill 文件夹后上传 files[]，云端写临时目录
    后复用既有 import_from_external 解析落 Store。scope=team 需团队成员校验。
    """
    try:
        scope = (data.scope or "personal").lower()
        if scope == "team":
            if not data.team_id:
                return {"success": False, "error": "scope=team 时必须提供 team_id"}
            if data.team_id not in await _user_team_ids(user_id):
                return {"success": False, "error": "无权导入到该团队（非团队成员）"}
        skill = await NativeSkillStore.import_from_content(
            [f.model_dump() for f in data.files],
            origin=data.origin,
            owner_id=user_id,
            scope=scope,
            team_id=data.team_id,
        )
        return {"success": True, "skill": skill}
    except (FileNotFoundError, ValueError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception("[store/import-content] 按内容导入失败")
        return {"success": False, "error": str(e)}


@api_router.post("/{skill_id}/complete")
async def complete_skill(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """调用 LLM 为缺失字段生成建议值，返回给前端供用户确认"""
    try:
        await _assert_skill_accessible(skill_id, user_id)
        result = await NativeSkillStore.complete_fields(skill_id)
        return {"success": True, **result}
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/complete] {skill_id} 补齐失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{skill_id}/build")
async def build_skill(
    skill_id: str, data: NativeSkillBuildRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        await _assert_skill_accessible(skill_id, user_id)
        result = await NativeSkillStore.build(skill_id, data.target)
        return result
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/build] {skill_id} 构建失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post(
    "/{skill_id}/build-artifact",
    response_model=BuildArtifactResponse,
    response_model_by_alias=True,
)
async def build_store_skill_artifact(
    skill_id: str, data: BuildArtifactRequest,
    user_id: str = Depends(get_current_user_id),
):
    """方案 B · M4 编排端点（store 级）：个人/团队仓库 Skill 构建产物。

    对应前端 deployNativeSkillOrchestrated。返回 contents(文本)+resources(base64
    inline)+repoHash+abstractSnapshot，**不写后端盘**。归属守卫复用 build/deploy 口径
    （IDOR 防护）。契约 §9 未单列 store 级 build-artifact，本端点补齐并与前端对齐。
    """
    try:
        await _assert_skill_accessible(skill_id, user_id)
        return await project_service.build_store_skill_artifact(
            skill_id, user_id, data.tool
        )
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/build-artifact] {skill_id} 构建产物失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{skill_id}/deploy", response_model=NativeSkillDeployResponse)
async def deploy_skill(
    skill_id: str, data: NativeSkillDeployRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        await _assert_skill_accessible(skill_id, user_id)
        result = await NativeSkillStore.deploy(
            skill_id, data.target, dest_path=data.dest_path, user_id=user_id
        )
        return result
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except PermissionError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/deploy] {skill_id} 部署失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/{skill_id}/preview", response_model=NativeSkillPreviewResponse)
async def preview_skill(
    skill_id: str, target: str = "all",
    user_id: str = Depends(get_current_user_id),
):
    try:
        await _assert_skill_accessible(skill_id, user_id)
        result = await NativeSkillStore.preview(skill_id, target)
        return result
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[store/preview] {skill_id} 预览失败")
        raise HTTPException(status_code=500, detail=str(e))
