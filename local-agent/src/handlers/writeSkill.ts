import { LocalCoreError, writeSkill } from "@vibebara/local-core";
import { API_VERSION } from "../constants";
import type { AgentContext } from "../context";
import { AgentError } from "../errors";
import type { WriteSkillRequest, WriteSkillResponse } from "../types";

/**
 * POST /local/write-skill —— 落盘部署产物（核心写端点）。
 * 替代 NativeSkillStore.deploy 的写盘段（native_skill_store.py:963-998）。
 *
 * 覆盖语义（与现状一致）：先 rm -rf installPath 再重建写入。
 * install 路径推导（对齐 project_service._install_root）：
 *   project: {deployPath}/.{tool}/skills/{skillId}
 *   platform: {平台 skill 目录}/{skillId}（忽略 deployPath）
 *
 * 【M5-b 任务③ 白名单收紧】写盘授权来源 = **用户确认选定的 deployPath 根**（部署/导入
 * 流程中经桌面确认的目标目录），而非 browse 被动登记的目录。project scope 下，
 * write-skill 校验 deployPath 为已存在的真实目录后将其登记为可写根，再做 realpath/`..`
 * 逃逸校验；platform scope 仍走平台 skill 目录白名单（createContext 注入）。
 *
 * 安全：配对令牌（路由层）+ 可写根白名单（本函数，授权绑定 deployPath）+ realpath/`..`
 * 逐条目逃逸防护。
 */
export function handleWriteSkill(
  input: WriteSkillRequest,
  ctx: AgentContext,
): WriteSkillResponse {
  try {
    const result = writeSkill(input, { writableRoots: ctx.writableRoots });
    return { ok: true, apiVersion: API_VERSION, ...result };
  } catch (error) {
    if (error instanceof LocalCoreError) {
      throw new AgentError(error.code, error.message, error.detail);
    }
    throw error;
  }
}
