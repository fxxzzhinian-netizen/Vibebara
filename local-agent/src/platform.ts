import os from "node:os";
import path from "node:path";

/**
 * 平台 skill 目录解析 —— 与后端 native_skill_store.py 的
 * CURSOR_SKILLS_DIR / CODEX_SKILLS_DIR / WINDSURF_SKILLS_DIR 保持一致：
 *   CURSOR_SKILLS_DIR   = ~/.cursor/skills
 *   CODEX_SKILLS_DIR    = $CODEX_HOME/skills（未设则 ~/.codex/skills）
 *   WINDSURF_SKILLS_DIR = ~/.codeium/windsurf/skills（注意在 ~/.codeium 下，不是 ~/.windsurf）
 *   CLAUDE_SKILLS_DIR   = ~/.claude/skills
 *   KIRO_SKILLS_DIR     = ~/.kiro/skills
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

export function platformSkillsDir(tool: ToolType): string {
  if (tool === "cursor") return cursorSkillsDir();
  if (tool === "windsurf") return windsurfSkillsDir();
  if (tool === "claude") return claudeSkillsDir();
  if (tool === "kiro") return kiroSkillsDir();
  return codexSkillsDir();
}
