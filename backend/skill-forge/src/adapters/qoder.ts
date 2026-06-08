import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * 解析 Qoder 全局 skill 目录（docs/skill-forge-design.md §9.5）。
 *
 * Qoder 全局目录统一为 ~/.qoder/skills，**无国内/国际分叉，无须自动探测**
 * （与 Trae 不同）。项目级目录为 .qoder/skills/，同名时项目级优先于全局。
 */
export function resolveQoderSkillsDir(): string {
  return path.join(os.homedir(), ".qoder", "skills");
}

/**
 * Qoder (阿里巴巴) skill adapter.
 *
 * Qoder 原生支持开放的 Agent Skills 标准，与 Windsurf/Trae 同源的 SKILL.md
 * 文件夹格式：目录含 SKILL.md（YAML frontmatter）+ 任意附带文件。Qoder 启动时
 * 只加载 name+description，匹配请求或 `/skill-name` 显式调用时才加载全文。
 *
 * 严格约束（docs/skill-forge-design.md §九）：Qoder 官方 frontmatter（IDE 与
 * CLI 文档一致）仅文档化 `name` + `description`。本适配器**只输出这两个字段**，
 * 不泄漏 Cursor 的 disable-model-invocation、Codex 的 openai.yaml、Claude 的
 * 运行时字段或任何 metadata，忠于官方规范——与 Windsurf/Trae 适配器完全一致。
 * 附带 scripts/references/assets 全部复制。
 *
 * Deploy dirs:
 *   - workspace: {project}/.qoder/skills/  (由调用方处理)
 *   - global:    ~/.qoder/skills/ （统一目录，无须探测）
 */
export class QoderAdapter implements Adapter {
  readonly target = "qoder" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "qoder");
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
    return resolveQoderSkillsDir();
  }
}
