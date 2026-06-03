import path from "node:path";
import { readFile, exists, writeFile } from "../utils/fs.js";
import { parseFrontmatter, parseYaml, dumpYaml } from "../utils/yaml.js";

export type ImportSource = "cursor" | "codex";

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