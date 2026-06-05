import fs from "node:fs";
import path from "node:path";
import { cursorSkillsDir, codexSkillsDir, windsurfSkillsDir, claudeSkillsDir, kiroSkillsDir } from "../platform";
import type { UnifiedSkillPackage } from "../types";
import { detectOrigin } from "./detect";
import { parseFrontmatter, parseYaml } from "./frontmatter";

/**
 * scan 来源识别移植（R1）—— 纯 TS 复刻 skill-forge bridge `scan-and-package`：
 *   · src/commands/package.ts::scanAndPackage / packageSkill
 *   · src/commands/import.ts::importSkill（仅提取契约所需字段）
 *   · 并内联 backend/skill_forge_service.py::SkillRegistry._normalize_packages 的
 *     「PackageResult → UnifiedSkillPackage(camelCase)」归一化，直接产出契约结构，
 *     便于云端复用（与现有 scan-and-package 输出结构对齐）。
 */

function existsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/** 列出 dir 下不以 `.` 开头的子目录绝对路径（对齐 package.ts::listSubDirs）。 */
function listSubDirs(dir: string): string[] {
  const result: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      result.push(path.join(dir, entry.name));
    }
  }
  return result;
}

/** 列出 dir 下的直接条目名（对齐 package.ts::listDirEntries）。 */
function listDirEntries(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

interface ExtractedConfig {
  name?: string;
  description?: string;
  displayName?: string;
  shortDescription?: string;
}

/**
 * 提取契约所需配置字段 —— 复刻 import.ts 的 importFromCursor/importFromCodex
 * （importFrom = origin==="unknown" ? "codex" : origin）。
 */
function extractConfigFields(
  skillDir: string,
  origin: "cursor" | "codex" | "unknown",
): ExtractedConfig {
  const importFrom = origin === "unknown" ? "codex" : origin;

  const skillMdPath = path.join(skillDir, "SKILL.md");
  let frontmatter: Record<string, unknown> = {};
  if (existsSync(skillMdPath)) {
    ({ frontmatter } = parseFrontmatter(fs.readFileSync(skillMdPath, "utf-8")));
  }

  const config: ExtractedConfig = {
    name: frontmatter["name"] as string | undefined,
    description: frontmatter["description"] as string | undefined,
  };

  if (importFrom === "cursor") {
    return config; // cursor 导入不含 displayName / shortDescription
  }

  // codex 路径
  const metadata = frontmatter["metadata"] as Record<string, unknown> | undefined;
  if (metadata?.["short-description"]) {
    config.shortDescription = metadata["short-description"] as string;
  }

  const agentYamlPath = path.join(skillDir, "agents", "openai.yaml");
  if (existsSync(agentYamlPath)) {
    let agentYaml: Record<string, unknown> = {};
    try {
      agentYaml = parseYaml<Record<string, unknown>>(
        fs.readFileSync(agentYamlPath, "utf-8"),
      );
    } catch {
      agentYaml = {};
    }
    const iface = agentYaml["interface"] as Record<string, unknown> | undefined;
    if (iface) {
      config.displayName = iface["display_name"] as string | undefined;
      const rawShort =
        config.shortDescription ?? (iface["short_description"] as string | undefined);
      if (rawShort) {
        config.shortDescription =
          rawShort.length > 256 ? rawShort.slice(0, 253) + "..." : rawShort;
      }
    }
  }

  return config;
}

/** 复刻 package.ts::packageSkill + _normalize_packages，直接产出契约 UnifiedSkillPackage。 */
export function packageSkill(skillDir: string): UnifiedSkillPackage {
  const id = path.basename(skillDir);
  const detection = detectOrigin(skillDir);
  const config = extractConfigFields(skillDir, detection.origin);

  const scripts = listDirEntries(path.join(skillDir, "scripts"));
  const references = listDirEntries(path.join(skillDir, "references"));
  const assets = listDirEntries(path.join(skillDir, "assets"));

  const installedAt = {
    cursor: existsSync(path.join(cursorSkillsDir(), id, "SKILL.md")),
    codex: existsSync(path.join(codexSkillsDir(), id, "SKILL.md")),
    windsurf: existsSync(path.join(windsurfSkillsDir(), id, "SKILL.md")),
    claude: existsSync(path.join(claudeSkillsDir(), id, "SKILL.md")),
    kiro: existsSync(path.join(kiroSkillsDir(), id, "SKILL.md")),
  };

  return {
    id,
    origin: detection.origin,
    originConfidence: detection.confidence,
    originSignals: detection.signals,
    sourcePath: skillDir,
    name: config.name || id,
    displayName: config.displayName || "",
    description: config.description || "",
    shortDescription: config.shortDescription || "",
    hasScripts: scripts.length > 0,
    hasReferences: references.length > 0,
    hasAssets: assets.length > 0,
    installedAt,
  };
}

/** 扫描 rootDir 下含 SKILL.md 的一级子目录，逐个识别并归一化输出。 */
export function scanAndPackage(rootDir: string): UnifiedSkillPackage[] {
  const results: UnifiedSkillPackage[] = [];
  for (const dir of listSubDirs(rootDir)) {
    if (!existsSync(path.join(dir, "SKILL.md"))) continue;
    try {
      results.push(packageSkill(dir));
    } catch (err) {
      // 单个 skill 解析失败不影响整体（对齐 bridge 行为）
      // eslint-disable-next-line no-console
      console.error(
        `[scan] 跳过 ${dir}：${(err as Error).message}`,
      );
    }
  }
  return results;
}
