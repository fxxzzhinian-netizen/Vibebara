import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * 平台 skill 目录解析 —— 与后端 native_skill_store.py 的
 * CURSOR_SKILLS_DIR / CODEX_SKILLS_DIR / WINDSURF_SKILLS_DIR 保持一致：
 *   CURSOR_SKILLS_DIR   = ~/.cursor/skills
 *   CODEX_SKILLS_DIR    = $CODEX_HOME/skills（未设则 ~/.codex/skills）
 *   WINDSURF_SKILLS_DIR = ~/.codeium/windsurf/skills（注意在 ~/.codeium 下，不是 ~/.windsurf）
 *   CLAUDE_SKILLS_DIR   = ~/.claude/skills
 *   KIRO_SKILLS_DIR     = ~/.kiro/skills
 *   TRAE_SKILLS_DIR     = ~/.trae/skills（自动探测，国内版回退 ~/.trae-cn/skills）
 *   QODER_SKILLS_DIR    = ~/.qoder/skills（统一目录，无国内/国际分叉）
 *   WORKBUDDY_SKILLS_DIR = ~/.workbuddy/skills（统一目录，无国内/国际分叉）
 *
 * 注：skill-forge 的 package.ts 用 HOME||USERPROFILE 解析 home，
 * os.homedir() 在 Windows 上返回 USERPROFILE，二者口径一致。
 */

import type { ToolType } from "./types";

export function cursorSkillsDir(): string {
  return path.join(os.homedir(), ".cursor", "skills");
}

export function codexSkillsDir(): string {
  const codexHome = process.env["CODEX_HOME"];
  if (codexHome && codexHome.trim()) {
    return path.join(codexHome, "skills");
  }
  return path.join(os.homedir(), ".codex", "skills");
}

export function windsurfSkillsDir(): string {
  return path.join(os.homedir(), ".codeium", "windsurf", "skills");
}

export function claudeSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

export function kiroSkillsDir(): string {
  return path.join(os.homedir(), ".kiro", "skills");
}

/**
 * Trae 全局 skill 目录自动探测（docs/design/skill-forge.md §8.5）：
 *   - 若 ~/.trae 存在     → ~/.trae/skills（国际版 trae.ai）
 *   - 否则若 ~/.trae-cn 存在 → ~/.trae-cn/skills（国内版 trae.cn）
 *   - 否则                → ~/.trae/skills（默认）
 * 与 skill-forge 的 resolveTraeSkillsDir / 后端 trae_skills_dir 口径一致。
 */
export function traeSkillsDir(): string {
  const home = os.homedir();
  const intl = path.join(home, ".trae");
  const cn = path.join(home, ".trae-cn");
  if (existsSync(intl)) return path.join(intl, "skills");
  if (existsSync(cn)) return path.join(cn, "skills");
  return path.join(intl, "skills");
}

/**
 * Qoder 全局 skill 目录（docs/design/skill-forge.md §9.5）：
 * 统一为 ~/.qoder/skills，**无国内/国际分叉，无须探测**（与 Trae 不同）。
 * 与 skill-forge 的 resolveQoderSkillsDir / 后端 qoder_skills_dir 口径一致。
 */
export function qoderSkillsDir(): string {
  return path.join(os.homedir(), ".qoder", "skills");
}

/**
 * WorkBuddy（腾讯 CodeBuddy 生态）全局 skill 目录（docs/design/skill-forge.md §9.6）：
 * 统一为 ~/.workbuddy/skills，**无国内/国际分叉，无须探测**（与 Qoder 同）。
 * 与 skill-forge 的 resolveWorkbuddySkillsDir / 后端 workbuddy_skills_dir 口径一致。
 */
export function workbuddySkillsDir(): string {
  return path.join(os.homedir(), ".workbuddy", "skills");
}

export function platformSkillsDir(tool: ToolType): string {
  if (tool === "cursor") return cursorSkillsDir();
  if (tool === "windsurf") return windsurfSkillsDir();
  if (tool === "claude") return claudeSkillsDir();
  if (tool === "kiro") return kiroSkillsDir();
  if (tool === "trae") return traeSkillsDir();
  if (tool === "qoder") return qoderSkillsDir();
  if (tool === "workbuddy") return workbuddySkillsDir();
  return codexSkillsDir();
}
