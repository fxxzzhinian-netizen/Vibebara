import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * Claude Code skill adapter.
 *
 * Claude Code Agent Skills use the same SKILL.md folder format as Cursor /
 * Windsurf: a directory containing SKILL.md (YAML frontmatter: name +
 * description) plus any supporting files. Claude loads the full content only
 * when the skill is invoked (progressive disclosure).
 *
 * Deploy dirs:
 *   - workspace: {project}/.claude/skills/  (handled by callers, mirrors .cursor/.codex)
 *   - global:    ~/.claude/skills/
 */
export class ClaudeAdapter implements Adapter {
  readonly target = "claude" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "claude");
    const skillDir = path.join(outputDir, config.name);
    const files: string[] = [];

    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
    };

    const skillMd = buildFrontmatter(frontmatter, config.instructions);
    await writeFile(path.join(skillDir, "SKILL.md"), skillMd);
    files.push("SKILL.md");

    const sourceRoot = process.cwd();
    if (config.resources.scripts.length > 0) {
      await copyResourceDirs(sourceRoot, skillDir, config.resources.scripts);
      files.push(...config.resources.scripts.map((s: string) => s + "*"));
    }
    if (config.resources.references.length > 0) {
      await copyResourceDirs(sourceRoot, skillDir, config.resources.references);
      files.push(...config.resources.references.map((r: string) => r + "*"));
    }
    if (config.resources.assets.length > 0) {
      await copyResourceDirs(sourceRoot, skillDir, config.resources.assets);
      files.push(...config.resources.assets.map((a: string) => a + "*"));
    }

    return { outputDir: skillDir, files };
  }

  getDeployDir(): string {
    return path.join(os.homedir(), ".claude", "skills");
  }
}
