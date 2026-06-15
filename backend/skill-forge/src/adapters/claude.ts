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
 * Claude Code 的 skill 采用 Agent Skills 开放标准，并在其上扩展了一组运行时
 * frontmatter 字段（model / effort / context: fork / agent / hooks /
 * allowed-tools / user-invocable / argument-hint / when_to_use 等）。这些字段
 * 全部写入同一个 SKILL.md frontmatter —— Claude 没有 Codex 那样独立的
 * agents/openai.yaml 元数据文件。
 *
 * 因此「按 Claude 平台特有结构构建」= 把抽象包里的标准字段与 `claude` 块完整
 * 映射进 SKILL.md frontmatter，而非退化为只写 name + description。
 * 详见 docs/design/skill-forge.md §五。
 *
 * Deploy dirs:
 *   - workspace: {project}/.claude/skills/  (handled by callers)
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

    // policy.auto_invoke == false（即 disableModelInvocation == true）→ 输出。
    // 与 Cursor 共用同一语义。
    if (config.triggers.disableModelInvocation === true) {
      frontmatter["disable-model-invocation"] = true;
    }

    // 标准 Agent Skills 元数据
    const meta = config.metadata;
    if (meta.license) frontmatter["license"] = meta.license;
    if (meta.compatibility) frontmatter["compatibility"] = meta.compatibility;
    if (meta.author || meta.version) {
      const m: Record<string, unknown> = {};
      if (meta.author) m["author"] = meta.author;
      if (meta.version) m["version"] = meta.version;
      frontmatter["metadata"] = m;
    }

    // Claude 专有运行时字段（有值才输出，最小产物退化为 name + description）
    const c = config.claude;
    if (c.allowedTools !== undefined) {
      frontmatter["allowed-tools"] = c.allowedTools;
    }
    if (c.disallowedTools !== undefined) {
      frontmatter["disallowed-tools"] = c.disallowedTools;
    }
    if (c.userInvocable === false) {
      frontmatter["user-invocable"] = false;
    }
    if (c.argumentHint) frontmatter["argument-hint"] = c.argumentHint;
    if (c.whenToUse) frontmatter["when_to_use"] = c.whenToUse;
    if (c.model) frontmatter["model"] = c.model;
    if (c.effort) frontmatter["effort"] = c.effort;
    if (c.context === "fork") {
      frontmatter["context"] = "fork";
      if (c.agent) frontmatter["agent"] = c.agent;
    }
    if (c.hooks && Object.keys(c.hooks).length > 0) {
      frontmatter["hooks"] = c.hooks;
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
    return path.join(os.homedir(), ".claude", "skills");
  }
}
