import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

export class CursorAdapter implements Adapter {
  readonly target = "cursor" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "cursor");
    const skillDir = path.join(outputDir, config.name);
    const files: string[] = [];

    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
    };
    if (config.triggers.disableModelInvocation !== undefined) {
      frontmatter["disable-model-invocation"] =
        config.triggers.disableModelInvocation;
    }

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
    // 复制通用资源（图标等平台特有资源在 assets 列表里时也会复制，由抽象包负责不声明
    // Cursor 不需要的图标；与 Codex/Claude/Windsurf 资源复制约定对齐）。
    if (config.resources.assets.length > 0) {
      await copyResourceDirs(sourceRoot, skillDir, config.resources.assets);
      files.push(...config.resources.assets.map((a: string) => a + "*"));
    }

    return { outputDir: skillDir, files };
  }

  getDeployDir(): string {
    return path.join(os.homedir(), ".cursor", "skills");
  }
}