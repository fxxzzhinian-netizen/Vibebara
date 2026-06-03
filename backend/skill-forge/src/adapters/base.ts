import type { UnifiedSkillConfig } from "../schema/unified.js";

export interface BuildResult {
  outputDir: string;
  files: string[];
}

export interface Adapter {
  readonly target: "cursor" | "codex";
  build(config: UnifiedSkillConfig, outputDir: string): Promise<BuildResult>;
  getDeployDir(): string;
}

export function applyTargetOverrides(
  config: UnifiedSkillConfig,
  target: "cursor" | "codex"
): UnifiedSkillConfig {
  const overrides = config.targets?.[target];
  if (!overrides) return config;
  return { ...config, ...overrides } as UnifiedSkillConfig;
}