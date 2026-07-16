import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolType } from "./types";

export function cursorSkillsDir(): string {
  return path.join(os.homedir(), ".cursor", "skills");
}

export function codexSkillsDir(): string {
  const codexHome = process.env["CODEX_HOME"];
  return codexHome?.trim()
    ? path.join(codexHome, "skills")
    : path.join(os.homedir(), ".codex", "skills");
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

export function traeSkillsDir(): string {
  const intl = path.join(os.homedir(), ".trae");
  const cn = path.join(os.homedir(), ".trae-cn");
  if (existsSync(intl)) return path.join(intl, "skills");
  if (existsSync(cn)) return path.join(cn, "skills");
  return path.join(intl, "skills");
}

export function qoderSkillsDir(): string {
  return path.join(os.homedir(), ".qoder", "skills");
}

export function workbuddySkillsDir(): string {
  return path.join(os.homedir(), ".workbuddy", "skills");
}

export function platformSkillsDir(tool: ToolType): string {
  const resolvers: Record<ToolType, () => string> = {
    cursor: cursorSkillsDir,
    codex: codexSkillsDir,
    windsurf: windsurfSkillsDir,
    claude: claudeSkillsDir,
    kiro: kiroSkillsDir,
    trae: traeSkillsDir,
    qoder: qoderSkillsDir,
    workbuddy: workbuddySkillsDir,
  };
  return resolvers[tool]();
}
