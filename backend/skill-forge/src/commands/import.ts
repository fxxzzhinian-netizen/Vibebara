import path from "node:path";
import { readFile, exists, writeFile } from "../utils/fs.js";
import { parseFrontmatter, parseYaml, dumpYaml } from "../utils/yaml.js";

export type ImportSource =
  | "cursor"
  | "codex"
  | "claude"
  | "windsurf"
  | "kiro"
  | "trae"
  | "qoder";

export interface ImportOptions {
  from: ImportSource;
  path: string;
  outputDir?: string;
}

export async function importSkill(options: ImportOptions) {
  const { from, path: sourcePath, outputDir } = options;

  const skillMdPath = path.join(sourcePath, "SKILL.md");
  if (!(await exists(skillMdPath))) {
    throw new Error(`SKILL.md not found in ${sourcePath}`);
  }

  const skillMd = await readFile(skillMdPath);
  const { frontmatter, body } = parseFrontmatter(skillMd);

  let config: Record<string, unknown>;

  if (from === "cursor") {
    config = importFromCursor(frontmatter, body);
  } else if (from === "claude") {
    config = importFromClaude(frontmatter, body);
  } else if (from === "windsurf") {
    config = importFromWindsurf(frontmatter, body);
  } else if (from === "kiro") {
    config = importFromKiro(frontmatter, body);
  } else if (from === "trae") {
    config = importFromTrae(frontmatter, body);
  } else if (from === "qoder") {
    config = importFromQoder(frontmatter, body);
  } else {
    config = await importFromCodex(frontmatter, body, sourcePath);
  }

  const outDir = outputDir ?? process.cwd();
  const configYaml = dumpYaml(config);
  const configPath = path.join(outDir, "skill.config.yaml");
  await writeFile(configPath, configYaml);

  return { configPath, config };
}

function importFromCursor(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  return {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
    triggers: {
      disableModelInvocation:
        (frontmatter["disable-model-invocation"] as boolean) ?? true,
      allowImplicitInvocation: true,
    },
  };
}

/**
 * Windsurf 原生 skill 信息最稀疏，frontmatter 仅 name + description。
 * 也用作 unknown / 通用来源的中性解析路径（纯 name + description + body）。
 */
function importFromWindsurf(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  return {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };
}

/**
 * Trae 原生 skill：与 Windsurf 同源，frontmatter 仅 name + description。
 * 还原到抽象包的核心字段，无 ui.* / claude.* / policy / metadata 概念
 * （docs/design/skill-forge.md §11.9）。
 */
function importFromTrae(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  return {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };
}

/**
 * Qoder 原生 skill：与 Windsurf/Trae 同源，frontmatter 仅 name + description。
 * 还原到抽象包的核心字段，无 ui.* / claude.* / policy / metadata 概念
 * （docs/design/skill-forge.md §11.10）。
 */
function importFromQoder(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  return {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };
}

/**
 * Kiro 原生 skill：Agent Skills 标准核心字段——name + description + 可选
 * license / compatibility / metadata(author/version)。还原到抽象包的标准 metadata
 * 块；无 ui.* / claude.* / policy 概念（docs/design/skill-forge.md §11.8）。
 */
function importFromKiro(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };

  const metadata: Record<string, unknown> = {};
  if (frontmatter["license"]) metadata.license = frontmatter["license"];
  if (frontmatter["compatibility"])
    metadata.compatibility = frontmatter["compatibility"];
  const fmMeta = frontmatter["metadata"] as Record<string, unknown> | undefined;
  if (fmMeta?.["author"]) metadata.author = fmMeta["author"];
  if (fmMeta?.["version"]) metadata.version = fmMeta["version"];
  if (Object.keys(metadata).length > 0) config.metadata = metadata;

  return config;
}

/**
 * Claude Code 原生 skill：解析标准字段 + 全部 Claude 专有运行时 frontmatter，
 * 还原到抽象包的 metadata 与 claude 块（docs/design/skill-forge.md §11.6）。
 */
function importFromClaude(
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };

  if (frontmatter["disable-model-invocation"] !== undefined) {
    config.triggers = {
      disableModelInvocation: frontmatter["disable-model-invocation"] as boolean,
      allowImplicitInvocation: true,
    };
  }

  // 标准 Agent Skills 元数据
  const metadata: Record<string, unknown> = {};
  if (frontmatter["license"]) metadata.license = frontmatter["license"];
  if (frontmatter["compatibility"])
    metadata.compatibility = frontmatter["compatibility"];
  const fmMeta = frontmatter["metadata"] as Record<string, unknown> | undefined;
  if (fmMeta?.["author"]) metadata.author = fmMeta["author"];
  if (fmMeta?.["version"]) metadata.version = fmMeta["version"];
  if (Object.keys(metadata).length > 0) config.metadata = metadata;

  // Claude 专有运行时字段
  const claude: Record<string, unknown> = {};
  if (frontmatter["allowed-tools"] !== undefined)
    claude.allowedTools = frontmatter["allowed-tools"];
  if (frontmatter["disallowed-tools"] !== undefined)
    claude.disallowedTools = frontmatter["disallowed-tools"];
  if (frontmatter["user-invocable"] !== undefined)
    claude.userInvocable = frontmatter["user-invocable"];
  if (frontmatter["argument-hint"])
    claude.argumentHint = frontmatter["argument-hint"];
  if (frontmatter["when_to_use"]) claude.whenToUse = frontmatter["when_to_use"];
  if (frontmatter["model"]) claude.model = frontmatter["model"];
  if (frontmatter["effort"]) claude.effort = frontmatter["effort"];
  if (frontmatter["context"]) claude.context = frontmatter["context"];
  if (frontmatter["agent"]) claude.agent = frontmatter["agent"];
  if (frontmatter["hooks"]) claude.hooks = frontmatter["hooks"];
  if (Object.keys(claude).length > 0) config.claude = claude;

  return config;
}

async function importFromCodex(
  frontmatter: Record<string, unknown>,
  body: string,
  sourcePath: string
): Promise<Record<string, unknown>> {
  const config: Record<string, unknown> = {
    name: frontmatter["name"],
    description: frontmatter["description"],
    version: "1.0.0",
    instructions: body,
  };

  const metadata = frontmatter["metadata"] as
    | Record<string, unknown>
    | undefined;
  if (metadata?.["short-description"]) {
    config.shortDescription = metadata["short-description"];
  }

  const agentYamlPath = path.join(sourcePath, "agents", "openai.yaml");
  if (await exists(agentYamlPath)) {
    const agentYaml = parseYaml<Record<string, unknown>>(
      await readFile(agentYamlPath)
    );
    const iface = agentYaml["interface"] as Record<string, unknown> | undefined;
    if (iface) {
      config.displayName = iface["display_name"];
      const rawShort =
        (config.shortDescription as string | undefined) ??
        (iface["short_description"] as string | undefined);
      if (rawShort) {
        config.shortDescription =
          rawShort.length > 256 ? rawShort.slice(0, 253) + "..." : rawShort;
      }
      config.ui = {
        iconSmall: iface["icon_small"],
        iconLarge: iface["icon_large"],
        brandColor: iface["brand_color"],
        defaultPrompt: iface["default_prompt"],
      };
    }
    const policy = agentYaml["policy"] as
      | Record<string, unknown>
      | undefined;
    if (policy) {
      config.triggers = {
        disableModelInvocation: true,
        allowImplicitInvocation:
          (policy["allow_implicit_invocation"] as boolean) ?? true,
      };
    }
    const deps = agentYaml["dependencies"] as
      | Record<string, unknown>
      | undefined;
    if (deps?.["tools"]) {
      config.dependencies = { tools: deps["tools"] };
    }
  }

  return config;
}