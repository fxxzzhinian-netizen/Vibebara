import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * 解析 Trae 全局 skill 目录（docs/skill-forge-design.md §8.5）。
 *
 * Trae 国际版（trae.ai）用 ~/.trae，国内版（trae.cn）用 ~/.trae-cn，两版项目目录
 * 都是 .trae/skills/。全局部署与安装态探测共用本解析逻辑：
 *   - 若 ~/.trae 存在     → ~/.trae/skills
 *   - 否则若 ~/.trae-cn 存在 → ~/.trae-cn/skills
 *   - 否则                → ~/.trae/skills（默认）
 */
export function resolveTraeSkillsDir(): string {
  const home = os.homedir();
  const intl = path.join(home, ".trae");
  const cn = path.join(home, ".trae-cn");
  if (existsSync(intl)) return path.join(intl, "skills");
  if (existsSync(cn)) return path.join(cn, "skills");
  return path.join(intl, "skills");
}

/**
 * Trae (字节跳动) skill adapter.
 *
 * Trae 原生支持开放的 Agent Skills 标准，与 Windsurf 同源的 SKILL.md 文件夹格式：
 * 目录含 SKILL.md（YAML frontmatter）+ 任意附带文件。Trae 启动时只扫描一级子目录
 * （不递归嵌套），匹配请求或显式调用时才加载全文。
 *
 * 严格约束（docs/skill-forge-design.md §八）：Trae 官方 frontmatter 仅文档化
 * `name` + `description`。本适配器**只输出这两个字段**，不泄漏 Cursor 的
 * disable-model-invocation、Codex 的 openai.yaml、Claude 的运行时字段或任何
 * metadata，忠于官方规范——与 WindsurfAdapter 完全一致。附带 scripts/references/
 * assets 全部复制。
 *
 * Deploy dirs:
 *   - workspace: {project}/.trae/skills/  (国际版 / 国内版相同，由调用方处理)
 *   - global:    ~/.trae/skills/ 或 ~/.trae-cn/skills/（resolveTraeSkillsDir 自动探测）
 */
export class TraeAdapter implements Adapter {
  readonly target = "trae" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "trae");
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
    return resolveTraeSkillsDir();
  }
}
