import path from "node:path";
import os from "node:os";
import { packageSkill } from "./package.js";
import type { Adapter } from "../adapters/base.js";
import { CursorAdapter } from "../adapters/cursor.js";
import { CodexAdapter } from "../adapters/codex.js";
import { WindsurfAdapter } from "../adapters/windsurf.js";
import { ClaudeAdapter } from "../adapters/claude.js";
import { KiroAdapter } from "../adapters/kiro.js";
import { TraeAdapter } from "../adapters/trae.js";
import { QoderAdapter } from "../adapters/qoder.js";
import { UnifiedSkillSchema } from "../schema/unified.js";
import { ensureDir, copyDir, writeFile } from "../utils/fs.js";
import { dumpYaml } from "../utils/yaml.js";

export type MigrateTarget =
  | "cursor"
  | "codex"
  | "windsurf"
  | "claude"
  | "kiro"
  | "trae"
  | "qoder";

function adapterFor(target: MigrateTarget): Adapter {
  if (target === "codex") return new CodexAdapter();
  if (target === "windsurf") return new WindsurfAdapter();
  if (target === "claude") return new ClaudeAdapter();
  if (target === "kiro") return new KiroAdapter();
  if (target === "trae") return new TraeAdapter();
  if (target === "qoder") return new QoderAdapter();
  return new CursorAdapter();
}

export interface MigrateOptions {
  sourcePath: string;
  targetPlatform: MigrateTarget;
  outputDir?: string;
}

export interface MigrateResult {
  id: string;
  origin: string;
  targetPlatform: string;
  adapted: boolean;
  targetDir: string;
  files: string[];
}

export async function migrateSkill(
  options: MigrateOptions,
): Promise<MigrateResult> {
  const { sourcePath, targetPlatform, outputDir } = options;
  const pkg = await packageSkill(sourcePath);

  if (pkg.origin === targetPlatform) {
    return {
      id: pkg.id,
      origin: pkg.origin,
      targetPlatform,
      adapted: false,
      targetDir: "",
      files: [],
    };
  }

  const validatedConfig = UnifiedSkillSchema.parse(pkg.config);

  const adapter = adapterFor(targetPlatform);
  const deployRoot = outputDir ?? adapter.getDeployDir();

  const tmpDir = path.join(
    os.tmpdir(),
    `skill-migrate-${Date.now()}-${pkg.id}`,
  );
  await ensureDir(tmpDir);

  try {
    const origCwd = process.cwd();
    process.chdir(sourcePath);
    const buildResult = await adapter.build(validatedConfig, tmpDir);
    process.chdir(origCwd);

    const destDir = path.join(deployRoot, pkg.id);
    await ensureDir(destDir);
    await copyDir(buildResult.outputDir, destDir);

    return {
      id: pkg.id,
      origin: pkg.origin,
      targetPlatform,
      adapted: true,
      targetDir: destDir,
      files: buildResult.files,
    };
  } finally {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  }
}
