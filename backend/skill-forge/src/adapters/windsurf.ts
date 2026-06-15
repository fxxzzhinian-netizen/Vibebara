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
 * Windsurf Cascade 现已原生支持 Agent Skills 标准的 skill 系统，与 Cursor 同源的
 * SKILL.md 文件夹格式：目录含 SKILL.md（YAML frontmatter）+ 任意附带文件。Cascade
 * 采用渐进式披露：默认只读取 name + description，技能被调用或 @mention 时才加载全文。
 *
 * 严格约束（docs/design/skill-forge.md §六）：Windsurf 官方 frontmatter 仅文档化
 * `name` + `description`。本适配器**只输出这两个字段**，不泄漏 Cursor 的
 * disable-model-invocation、Codex 的 openai.yaml、Claude 的运行时字段或任何
 * metadata，忠于官方规范。附带 scripts/references/assets 全部复制。
 *
 * Deploy dirs:
 *   - workspace: {project}/.windsurf/skills/  (handled by callers)
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

    // 严格只输出 name + description，其余字段精确丢弃。
    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
    };

    const skillMd = buildFrontmatter(frontmatter, config.instructions);
    await writeFile(path.join(skillDir, "SKILL.md"), skillMd);
    files.push("SKILL.md");

    const sourceRoot = process.cwd();
    for (const key of ["scripts", "references", "assets"] as const) {
      if (config.resources[key].length > 0) {
        await copyResourceDirs(sourceRoot, skillDir, config.resources[key]);
        files.push(...config.resources[key].map((d: string) => `${d}*`));
      }
    }

    return { outputDir: skillDir, files };
  }

  getDeployDir(): string {
    return path.join(os.homedir(), ".codeium", "windsurf", "skills");
  }
}
