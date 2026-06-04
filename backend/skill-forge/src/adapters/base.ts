import type { UnifiedSkillConfig } from "../schema/unified.js";

export interface BuildResult {
  outputDir: string;
  files: string[];
}

export type AdapterTarget = "cursor" | "codex" | "windsurf";

export interface Adapter {
  readonly target: AdapterTarget;
  build(config: UnifiedSkillConfig, outputDir: string): Promise<BuildResult>;
  getDeployDir(): string;
}

export function applyTargetOverrides(
  config: UnifiedSkillConfig,
  target: AdapterTarget
): UnifiedSkillConfig {
  const overrides = config.targets?.[target];
  if (!overrides) return config;
  return { ...config, ...overrides } as UnifiedSkillConfig;
}