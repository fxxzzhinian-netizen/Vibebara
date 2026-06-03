import path from "node:path";
import { CursorAdapter } from "../adapters/cursor.js";
import { CodexAdapter } from "../adapters/codex.js";
import { buildSkill, type Target } from "./build.js";
import { copyDir, ensureDir } from "../utils/fs.js";

export interface DeployOptions {
  target: Target;
  configPath?: string;
}

export async function deploySkill(
  options: DeployOptions,
): Promise<{ target: string; path: string }[]> {
  const { target, configPath } = options;
  const results = await buildSkill({ target, configPath });
  const deployed: { target: string; path: string }[] = [];

  for (const result of results) {
    const adapter =
      result.target === "cursor"
        ? new CursorAdapter()
        : new CodexAdapter();
    const deployDir = adapter.getDeployDir();
    const skillName = path.basename(result.outputDir);
    const destDir = path.join(deployDir, skillName);

    await ensureDir(destDir);
    await copyDir(result.outputDir, destDir);
    deployed.push({ target: result.target, path: destDir });
  }

  return deployed;
}
