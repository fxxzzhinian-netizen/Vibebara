import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

/**
 * 解析 WorkBuddy 全局 skill 目录（docs/design/skill-forge.md §9.6）。
 *
 * WorkBuddy（腾讯 CodeBuddy 生态）全局目录统一为 ~/.workbuddy/skills，**无国内/
 * 国际分叉，无须自动探测**（与 Qoder 同）。项目级目录为 .workbuddy/skills/，
 * 同名时项目级优先于全局。
 */
export function resolveWorkbuddySkillsDir(): string {
  return path.join(os.homedir(), ".workbuddy", "skills");
}

/**
 * WorkBuddy (腾讯 CodeBuddy 生态) skill adapter.
 *
 * WorkBuddy 的 skill 遵循开放 Agent Skills 标准（与 Qoder/Trae/Kiro 同源的
 * SKILL.md 文件夹格式：目录含 SKILL.md（YAML frontmatter）+ 任意附带文件，加载时
 * 只读 frontmatter，匹配请求或显式调用时才加载全文）。
 *
 * 与 Qoder/Trae 不同，WorkBuddy 的 marketplace 安装态 skill 额外携带 marketplace
 * 风格 frontmatter（基于真机 ~/.workbuddy/skills/ 样本）：在 `name` + `description`
 * 之外有 `version` / `display_name` / `display_name_en` / `description_zh` /
 * `description_en` / `visibility`。本适配器输出这组字段，值取自抽象包的 `workbuddy`
 * 块并带回退；`_en` 缺省时省略。
 *
 * 注意（docs/design/skill-forge.md §九）：`_skillhub_meta.json` / `_icon.svg` 是
 * SkillHub 市场发布/安装态产物（含无法本地伪造的 skillId / source / 图标 CDN），
 * **本适配器不生成**——WorkBuddy 加载只读 SKILL.md frontmatter，边文件非必需。
 * 附带 scripts/references/assets 全部复制。
 *
 * Deploy dirs:
 *   - workspace: {project}/.workbuddy/skills/  (由调用方处理)
 *   - global:    ~/.workbuddy/skills/ （统一目录，无须探测）
 */
export class WorkBuddyAdapter implements Adapter {
  readonly target = "workbuddy" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "workbuddy");
    const skillDir = path.join(outputDir, config.name);
    const files: string[] = [];

    const wb = config.workbuddy ?? {};

    // marketplace 风格 frontmatter，字段顺序对齐真机样本；带回退，`_en` 缺省省略。
    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
      version: config.version,
      display_name: wb.displayName ?? config.displayName ?? config.name,
    };
    if (wb.displayNameEn) {
      frontmatter.display_name_en = wb.displayNameEn;
    }
    frontmatter.description_zh = wb.descriptionZh ?? config.description;
    if (wb.descriptionEn) {
      frontmatter.description_en = wb.descriptionEn;
    }
    frontmatter.visibility = wb.visibility ?? "public";

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
    return resolveWorkbuddySkillsDir();
  }
}
