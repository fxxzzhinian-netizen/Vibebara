import path from "node:path";
import os from "node:os";
import type { Adapter, BuildResult } from "./base.js";
import { applyTargetOverrides } from "./base.js";
import type { UnifiedSkillConfig } from "../schema/unified.js";
import { buildFrontmatter, dumpYaml } from "../utils/yaml.js";
import { writeFile, copyResourceDirs } from "../utils/fs.js";

export class CodexAdapter implements Adapter {
  readonly target = "codex" as const;

  async build(
    rawConfig: UnifiedSkillConfig,
    outputDir: string,
  ): Promise<BuildResult> {
    const config = applyTargetOverrides(rawConfig, "codex");
    const skillDir = path.join(outputDir, config.name);
    const files: string[] = [];

    const frontmatter: Record<string, unknown> = {
      name: config.name,
      description: config.description,
    };
    if (config.shortDescription) {
      frontmatter.metadata = {
        "short-description": config.shortDescription,
      };
    }

    const skillMd = buildFrontmatter(frontmatter, config.instructions);
    await writeFile(path.join(skillDir, "SKILL.md"), skillMd);
    files.push("SKILL.md");

    const agentYaml = this.buildAgentYaml(config);
    await writeFile(
      path.join(skillDir, "agents", "openai.yaml"),
      dumpYaml(agentYaml),
    );
    files.push("agents/openai.yaml");

    const sourceRoot = process.cwd();
    for (const key of ["scripts", "references", "assets"] as const) {
      if (config.resources[key].length > 0) {
        await copyResourceDirs(sourceRoot, skillDir, config.resources[key]);
        files.push(...config.resources[key].map((d: string) => `${d}*`));
      }
    }

    return { outputDir: skillDir, files };
  }

  private buildAgentYaml(
    config: UnifiedSkillConfig,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      interface: {
        display_name: config.displayName ?? config.name,
        short_description:
          config.shortDescription ?? config.description.slice(0, 64),
        ...(config.ui.iconSmall && { icon_small: config.ui.iconSmall }),
        ...(config.ui.iconLarge && { icon_large: config.ui.iconLarge }),
        ...(config.ui.brandColor && { brand_color: config.ui.brandColor }),
        ...(config.ui.defaultPrompt && {
          default_prompt: config.ui.defaultPrompt,
        }),
      },
    };

    if (config.dependencies.tools.length > 0) {
      result.dependencies = { tools: config.dependencies.tools };
    }

    result.policy = {
      allow_implicit_invocation: config.triggers.allowImplicitInvocation,
    };

    return result;
  }

  getDeployDir(): string {
    return path.join(
      process.env["CODEX_HOME"] ?? path.join(os.homedir(), ".codex"),
      "skills",
    );
  }
}
