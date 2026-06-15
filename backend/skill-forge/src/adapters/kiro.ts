import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * Kiro (AWS) skill adapter.
 *
 * Kiro 原生支持开放的 Agent Skills 标准：技能是含 SKILL.md 的文件夹，frontmatter
 * 至少包含 name + description，并接受标准可选字段 license / compatibility /
 * metadata（如 author/version）。Kiro 采用渐进式披露：启动时只加载 name +
 * description，匹配请求或用户以 `/` 显式调用时才加载全文。
 *
 * 定位（docs/design/skill-forge.md §七）：Kiro 介于 Windsurf 与 Claude 之间——
 * 比 Windsurf（仅 name+description）多出标准可选字段，但不含 Claude 的运行时
 * 扩展（model/effort/context/hooks/allowed-tools 等），也不含 Codex 的 ui.*。
 * 本适配器只输出 name + description + 条件 license/compatibility/metadata，其余
 * 字段精确丢弃。附带 scripts/references/assets 全部复制（图标文件不复制）。
 *
 * Deploy dirs:
 *   - workspace: {project}/.kiro/skills/  (handled by callers)
 *   - global:    ~/.kiro/skills/
 */
export class KiroAdapter implements Adapter {
  readonly target = "kiro" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "kiro");
    const skillDir = path.join(outputDir, config.name);
    const files: string[] = [];

    // name + description 必有；标准可选字段 license/compatibility/metadata 有值才输出。
    // 不输出 disable-model-invocation、metadata.surfaces、ui.*、claude.* 等其他平台字段。
    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
    };

    const meta = config.metadata;
    if (meta.license) frontmatter["license"] = meta.license;
    if (meta.compatibility) frontmatter["compatibility"] = meta.compatibility;
    if (meta.author || meta.version) {
      const m: Record<string, unknown> = {};
      if (meta.author) m["author"] = meta.author;
      if (meta.version) m["version"] = meta.version;
      frontmatter["metadata"] = m;
    }

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
    return path.join(os.homedir(), ".kiro", "skills");
  }
}
