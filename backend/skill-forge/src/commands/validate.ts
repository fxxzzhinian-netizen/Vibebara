import path from "node:path";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../schema/unified.js";
import { readFile, exists } from "../utils/fs.js";
import { parseYaml } from "../utils/yaml.js";

export interface ValidateResult {
  valid: boolean;
  errors: string[];
  config?: UnifiedSkillConfig;
}

export async function loadAndValidate(
  configPath?: string,
): Promise<ValidateResult> {
  const resolvedPath =
    configPath ?? path.join(process.cwd(), "skill.config.yaml");

  if (!(await exists(resolvedPath))) {
    return {
      valid: false,
      errors: [`Config file not found: ${resolvedPath}`],
    };
  }

  const raw = await readFile(resolvedPath);
  const data = parseYaml(raw);
  const result = UnifiedSkillSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    return { valid: false, errors };
  }

  return { valid: true, errors: [], config: result.data };
}
