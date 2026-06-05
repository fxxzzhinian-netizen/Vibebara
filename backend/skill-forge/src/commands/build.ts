import path from "node:path";
import type { BuildResult } from "../adapters/base.js";
import { CursorAdapter } from "../adapters/cursor.js";
import { CodexAdapter } from "../adapters/codex.js";
import { WindsurfAdapter } from "../adapters/windsurf.js";
import { ClaudeAdapter } from "../adapters/claude.js";
import { KiroAdapter } from "../adapters/kiro.js";
import { loadAndValidate } from "./validate.js";
import { ensureDir } from "../utils/fs.js";

export type Target =
  | "cursor"
  | "codex"
  | "windsurf"
  | "claude"
  | "kiro"
  | "all";

export interface BuildOptions {
  target: Target;
  configPath?: string;
  outputDir?: string;
}

function getAdapters(target: Target) {
  if (target === "cursor") return [new CursorAdapter()];
  if (target === "codex") return [new CodexAdapter()];
  if (target === "windsurf") return [new WindsurfAdapter()];
  if (target === "claude") return [new ClaudeAdapter()];
  if (target === "kiro") return [new KiroAdapter()];
  return [
    new CursorAdapter(),
    new CodexAdapter(),
    new WindsurfAdapter(),
    new ClaudeAdapter(),
    new KiroAdapter(),
  ];
}

export async function buildSkill(
  options: BuildOptions,
): Promise<(BuildResult & { target: string })[]> {
  const { target, configPath, outputDir } = options;

  const validation = await loadAndValidate(configPath);
  if (!validation.valid || !validation.config) {
    throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
  }

  const config = validation.config;
  const adapters = getAdapters(target);
  const results: (BuildResult & { target: string })[] = [];

  for (const adapter of adapters) {
    const outDir =
      outputDir ??
      path.join(process.cwd(), "dist-skill", adapter.target);
    await ensureDir(outDir);
    const result = await adapter.build(config, outDir);
    results.push({ target: adapter.target, ...result });
  }

  return results;
}
