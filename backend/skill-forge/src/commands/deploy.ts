import path from "node:path";
import type { Adapter } from "../adapters/base.js";
import { CursorAdapter } from "../adapters/cursor.js";
import { CodexAdapter } from "../adapters/codex.js";
import { WindsurfAdapter } from "../adapters/windsurf.js";
import { ClaudeAdapter } from "../adapters/claude.js";
import { KiroAdapter } from "../adapters/kiro.js";
import { TraeAdapter } from "../adapters/trae.js";
import { QoderAdapter } from "../adapters/qoder.js";
import { WorkBuddyAdapter } from "../adapters/workbuddy.js";
import { buildSkill, type Target } from "./build.js";
import { copyDir, ensureDir } from "../utils/fs.js";

function adapterFor(target: string): Adapter {
  if (target === "codex") return new CodexAdapter();
  if (target === "windsurf") return new WindsurfAdapter();
  if (target === "claude") return new ClaudeAdapter();
  if (target === "kiro") return new KiroAdapter();
  if (target === "trae") return new TraeAdapter();
  if (target === "qoder") return new QoderAdapter();
  if (target === "workbuddy") return new WorkBuddyAdapter();
  return new CursorAdapter();
}

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
    const adapter = adapterFor(result.target);
    const deployDir = adapter.getDeployDir();
    const skillName = path.basename(result.outputDir);
    const destDir = path.join(deployDir, skillName);

    await ensureDir(destDir);
    await copyDir(result.outputDir, destDir);
    deployed.push({ target: result.target, path: destDir });
  }

  return deployed;
}
