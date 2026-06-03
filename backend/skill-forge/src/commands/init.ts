import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, ensureDir, exists, readFile } from "../utils/fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTemplateDir(): string {
  return path.resolve(__dirname, "..", "..", "templates", "skill-template");
}

export interface InitOptions {
  name: string;
  outputDir?: string;
}

export async function initSkill(
  options: InitOptions,
): Promise<{ dir: string; name: string }> {
  const { name } = options;
  const targetDir = options.outputDir ?? path.join(process.cwd(), name);

  if (await exists(targetDir)) {
    throw new Error(`Directory already exists: ${targetDir}`);
  }

  await ensureDir(targetDir);

  const templateDir = getTemplateDir();
  const templateConfigPath = path.join(templateDir, "skill.config.yaml");

  let configContent: string;
  if (await exists(templateConfigPath)) {
    configContent = await readFile(templateConfigPath);
    configContent = configContent.replace(/\{\{name\}\}/g, name);
  } else {
    configContent = buildDefaultConfig(name);
  }

  await writeFile(path.join(targetDir, "skill.config.yaml"), configContent);

  const templateSkillMd = path.join(templateDir, "SKILL.md");
  let skillMdContent: string;
  if (await exists(templateSkillMd)) {
    skillMdContent = await readFile(templateSkillMd);
    skillMdContent = skillMdContent.replace(/\{\{name\}\}/g, name);
  } else {
    skillMdContent = `# ${name}\n\nYour skill instructions here.\n`;
  }
  await writeFile(path.join(targetDir, "SKILL.md"), skillMdContent);

  await ensureDir(path.join(targetDir, "scripts"));
  await ensureDir(path.join(targetDir, "references"));
  await ensureDir(path.join(targetDir, "assets"));

  return { dir: targetDir, name };
}

function buildDefaultConfig(name: string): string {
  return `name: ${name}
displayName: "${name}"
description: "A skill created with skill-forge"
shortDescription: "Short description"
version: "1.0.0"

instructions: |
  # ${name}
  ## Instructions
  Your skill instructions here.

triggers:
  disableModelInvocation: true
  allowImplicitInvocation: true

ui:
  brandColor: "#3B82F6"

resources:
  scripts:
    - scripts/
  references:
    - references/
  assets:
    - assets/
`;
}
