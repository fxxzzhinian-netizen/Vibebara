import path from "node:path";
import fs from "node:fs/promises";
import { detectOrigin, type DetectResult } from "../adapters/detect.js";
import { importSkill } from "./import.js";
import { exists, readFile } from "../utils/fs.js";
import { parseFrontmatter } from "../utils/yaml.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";

export interface PackageResult {
  id: string;
  origin: DetectResult["origin"];
  originConfidence: DetectResult["confidence"];
  originSignals: string[];
  sourcePath: string;
  config: UnifiedSkillConfig;
  resources: {
    scripts: string[];
    references: string[];
    assets: string[];
  };
  installedAt: {
    cursor: boolean;
    codex: boolean;
    windsurf: boolean;
    claude: boolean;
  };
}

async function listSubDirs(dir: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        result.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // directory not accessible
  }
  return result;
}

async function listDirEntries(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries;
  } catch {
    return [];
  }
}

function getCursorSkillsDir(): string {
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "";
  return path.join(home, ".cursor", "skills");
}

function getCodexSkillsDir(): string {
  const codexHome = process.env["CODEX_HOME"];
  if (codexHome) return path.join(codexHome, "skills");
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "";
  return path.join(home, ".codex", "skills");
}

function getWindsurfSkillsDir(): string {
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "";
  return path.join(home, ".codeium", "windsurf", "skills");
}

function getClaudeSkillsDir(): string {
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "";
  return path.join(home, ".claude", "skills");
}

export async function packageSkill(
  skillDir: string,
): Promise<PackageResult> {
  const id = path.basename(skillDir);
  // detectOrigin 直接基于 skillDir 路径做主信号判定（无需额外路径上下文）。
  const detection = await detectOrigin(skillDir);

  // unknown 用中性的 windsurf 解析（纯 name + description + body），
  // 不再假设为 codex，避免误套 Codex 专有解析逻辑。
  const importFrom =
    detection.origin === "unknown" ? "windsurf" : detection.origin;

  const { config: rawConfig } = await importSkill({
    from: importFrom,
    path: skillDir,
  });

  const config = rawConfig as unknown as UnifiedSkillConfig;

  const resources = {
    scripts: await listDirEntries(path.join(skillDir, "scripts")),
    references: await listDirEntries(path.join(skillDir, "references")),
    assets: await listDirEntries(path.join(skillDir, "assets")),
  };

  const cursorDir = getCursorSkillsDir();
  const codexDir = getCodexSkillsDir();
  const windsurfDir = getWindsurfSkillsDir();
  const claudeDir = getClaudeSkillsDir();

  const installedAt = {
    cursor: await exists(path.join(cursorDir, id, "SKILL.md")),
    codex: await exists(path.join(codexDir, id, "SKILL.md")),
    windsurf: await exists(path.join(windsurfDir, id, "SKILL.md")),
    claude: await exists(path.join(claudeDir, id, "SKILL.md")),
  };

  return {
    id,
    origin: detection.origin,
    originConfidence: detection.confidence,
    originSignals: detection.signals,
    sourcePath: skillDir,
    config,
    resources,
    installedAt,
  };
}

export async function scanAndPackage(
  rootDir: string,
): Promise<PackageResult[]> {
  const results: PackageResult[] = [];
  const subDirs = await listSubDirs(rootDir);

  for (const dir of subDirs) {
    const skillMd = path.join(dir, "SKILL.md");
    if (!(await exists(skillMd))) continue;

    try {
      const pkg = await packageSkill(dir);
      results.push(pkg);
    } catch (err) {
      // skip skills that fail to parse
      console.error(
        `[package] Failed to package ${dir}: ${(err as Error).message}`,
      );
    }
  }

  return results;
}
