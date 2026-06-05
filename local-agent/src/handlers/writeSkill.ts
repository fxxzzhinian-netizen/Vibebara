import fs from "node:fs";
import path from "node:path";
import { API_VERSION } from "../constants";
import type { AgentContext } from "../context";
import { AgentError } from "../errors";
import { writeContent } from "../fileio";
import { ensureGitignore } from "../gitignore";
import { computeDirHash } from "../hash";
import { platformSkillsDir } from "../platform";
import { isInside, safeJoinUnder } from "../security";
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
  // ---- 参数校验 ----
  const tool = input?.tool;
  if (
    tool !== "cursor" &&
    tool !== "codex" &&
    tool !== "windsurf" &&
    tool !== "claude" &&
    tool !== "kiro"
  ) {
    throw new AgentError("UNSUPPORTED_TOOL", "tool 必须为 cursor、codex、windsurf、claude 或 kiro");
  }
  const scope = input?.scope;
  if (scope !== "project" && scope !== "platform") {
    throw new AgentError("BAD_REQUEST", "scope 必须为 project 或 platform");
  }
  const skillId = input?.skillId;
  if (!skillId || typeof skillId !== "string" || !skillId.trim()) {
    throw new AgentError("BAD_REQUEST", "缺少 skillId");
  }
  if (skillId.includes("/") || skillId.includes("\\") || skillId.includes("..")) {
    throw new AgentError("BAD_REQUEST", `非法 skillId: ${skillId}`);
  }
  const contents = input.contents ?? {};
  const resources = input.resources ?? [];
  if (typeof contents !== "object" || Array.isArray(contents)) {
    throw new AgentError("BAD_REQUEST", "contents 必须为对象");
  }
  if (!Array.isArray(resources)) {
    throw new AgentError("BAD_REQUEST", "resources 必须为数组");
  }

  // ---- install 路径推导 + 可写根授权（任务③：绑定用户确认选定的 deployPath 根）----
  let installRoot: string;
  if (scope === "project") {
    const deployPath = input.deployPath;
    if (!deployPath || typeof deployPath !== "string" || !deployPath.trim()) {
      throw new AgentError("BAD_REQUEST", "scope=project 时 deployPath 必填");
    }
    // deployPath = 用户在部署/导入流程中确认选定的目标根目录（写盘授权来源）。
    // 必须是已存在的真实目录——杜绝凭空路径写入，且“确认选定”动作蕴含其已存在。
    let stat: fs.Stats;
    try {
      stat = fs.statSync(deployPath);
    } catch {
      throw new AgentError(
        "WRITE_ROOT_FORBIDDEN",
        "deployPath 不是已确认的有效目标目录（不存在）",
        `deployPath=${deployPath}`,
      );
    }
    if (!stat.isDirectory()) {
      throw new AgentError("NOT_A_DIRECTORY", `deployPath 不是目录: ${deployPath}`);
    }
    // 登记为可写根（绑定本次确认的部署根；供后续 hash/重部署/拉取校验复用）。
    ctx.writableRoots.register(deployPath);
    installRoot = path.join(deployPath, `.${tool}`, "skills");
  } else {
    installRoot = platformSkillsDir(tool);
  }
  const installPath = path.join(installRoot, skillId);

  // ---- 统一最终校验：可写根白名单 + realpath/`..` / 符号链接逃逸防护 ----
  // project：installPath 必落在刚登记的 deployPath 内；platform：落平台 skill 目录白名单。
  if (!ctx.writableRoots.isAllowed(installPath)) {
    throw new AgentError(
      "WRITE_ROOT_FORBIDDEN",
      "目标路径不在可写根白名单内",
      `installPath=${installPath}`,
    );
  }

  // ---- 覆盖语义 ----
  const exists = fs.existsSync(installPath);
  if (exists && !input.overwrite) {
    throw new AgentError("INSTALL_EXISTS", `install 目录已存在: ${installPath}`);
  }

  const written: string[] = [];
  try {
    if (exists) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }
    fs.mkdirSync(installPath, { recursive: true });

    // 1) 构建产物文本（contents）
    for (const [rel, text] of Object.entries(contents)) {
      const abs = safeJoinUnderOrBadRequest(installPath, rel);
      writeContent(abs, "utf8", typeof text === "string" ? text : String(text));
      written.push(rel);
    }

    // 2) 资源（可含二进制）
    for (const r of resources) {
      if (!r || typeof r.path !== "string") {
        throw new AgentError("BAD_REQUEST", "resource 缺少 path");
      }
      const abs = safeJoinUnderOrBadRequest(installPath, r.path);
      if (r.transfer === "url") {
        // D1：M3 仅支持 inline；url 为契约预留（M5 带 Bearer 下载）。
        throw new AgentError(
          "BAD_REQUEST",
          `transfer="url" 暂未实现（M3 仅支持 inline）: ${r.path}`,
        );
      }
      const encoding = r.encoding === "base64" ? "base64" : "utf8";
      writeContent(abs, encoding, r.content ?? "");
      written.push(r.path);
    }

    // 3) .gitignore（仅 scope=project）
    if (scope === "project" && input.ensureGitignore && input.deployPath) {
      ensureGitignore(input.deployPath);
    }
  } catch (err) {
    if (err instanceof AgentError) throw err;
    throw new AgentError("IO_ERROR", `落盘失败: ${(err as Error).message}`);
  }

  // 落盘后即算 installedHash（统一算法），省一次 /local/hash 往返
  const installedHash = computeDirHash(installPath);

  return {
    ok: true,
    apiVersion: API_VERSION,
    installPath,
    written,
    installedHash,
  };
}

/** safeJoinUnder 包装：路径非法 → BAD_REQUEST（含 `..`/绝对路径/逃逸）。 */
function safeJoinUnderOrBadRequest(installPath: string, rel: string): string {
  let abs: string;
  try {
    abs = safeJoinUnder(installPath, rel);
  } catch (err) {
    throw new AgentError("BAD_REQUEST", (err as Error).message);
  }
  // 再保险（理论上 safeJoinUnder 已保证）
  if (!isInside(abs, installPath)) {
    throw new AgentError("BAD_REQUEST", `写入路径逃逸: ${rel}`);
  }
  return abs;
}
