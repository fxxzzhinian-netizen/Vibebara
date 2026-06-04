import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * Windsurf (Cascade) skill adapter.
 *
 * Windsurf Wave 8+ supports skills in the same SKILL.md folder format as
 * Cursor: a directory containing SKILL.md (YAML frontmatter: name + description)
 * plus any supporting files. Cascade loads the full content only when the skill
 * is invoked or @mentioned (progressive disclosure).
 *
 * Deploy dirs:
 *   - workspace: {project}/.windsurf/skills/  (handled by callers, mirrors .cursor/.codex)
 *   - global:    ~/.codeium/windsurf/skills/  (note: under ~/.codeium, not ~/.windsurf)
 */
export class WindsurfAdapter implements Adapter {
  readonly target = "windsurf" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "windsurf");
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
    return path.join(os.homedir(), ".codeium", "windsurf", "skills");
  }
}
