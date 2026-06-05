import { z } from "zod";

const namePattern = /^[a-z0-9][a-z0-9-]*$/;

export const ToolDependencySchema = z.object({
  type: z.string(),
  value: z.string(),
  description: z.string().optional(),
  transport: z.string().optional(),
  url: z.string().optional(),
});

export const UnifiedSkillSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(namePattern, "Must be lowercase alphanumeric with hyphens"),
  displayName: z.string().min(1).optional(),
  description: z.string().min(1).max(1024),
  shortDescription: z.string().max(256).optional(),
  version: z.string().default("1.0.0"),

  instructions: z.string().min(1),

  triggers: z
    .object({
      disableModelInvocation: z.boolean().default(true),
      allowImplicitInvocation: z.boolean().default(true),
    })
    .default({}),

  ui: z
    .object({
      iconSmall: z.string().optional(),
      iconLarge: z.string().optional(),
      brandColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      defaultPrompt: z.string().optional(),
    })
    .default({}),

  // Claude Code 专有运行时 frontmatter 字段（与 Codex 专有的 `ui` 块平行）。
  // 构建到 Cursor/Codex/Windsurf 时整体丢弃；详见 docs/skill-forge-design.md §五。
  claude: z
    .object({
      allowedTools: z.union([z.string(), z.array(z.string())]).optional(),
      disallowedTools: z.union([z.string(), z.array(z.string())]).optional(),
      userInvocable: z.boolean().optional(),
      argumentHint: z.string().optional(),
      model: z.string().optional(),
      effort: z.string().optional(),
      context: z.enum(["inline", "fork"]).optional(),
      agent: z.string().optional(),
      whenToUse: z.string().optional(),
      hooks: z.record(z.unknown()).optional(),
    })
    .default({}),

  dependencies: z
    .object({
      tools: z.array(ToolDependencySchema).default([]),
    })
    .default({}),

  resources: z
    .object({
      scripts: z.array(z.string()).default([]),
      references: z.array(z.string()).default([]),
      assets: z.array(z.string()).default([]),
    })
    .default({}),

  // Agent Skills 标准元数据（跨平台）。各平台按支持情况选择性输出，详见设计文档矩阵。
  metadata: z
    .object({
      license: z.string().optional(),
      compatibility: z.string().optional(),
      author: z.string().optional(),
      version: z.string().optional(),
      surfaces: z.array(z.string()).optional(),
    })
    .default({}),

  targets: z
    .object({
      cursor: z.record(z.unknown()).optional(),
      codex: z.record(z.unknown()).optional(),
      windsurf: z.record(z.unknown()).optional(),
      claude: z.record(z.unknown()).optional(),
      kiro: z.record(z.unknown()).optional(),
    })
    .default({}),
});

export type UnifiedSkillConfig = z.infer<typeof UnifiedSkillSchema>;
export type ToolDependency = z.infer<typeof ToolDependencySchema>;

export const NativeSkillMetaSchema = z.object({
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  importedFrom: z
    .enum(["cursor", "codex", "windsurf", "claude", "kiro", "manual"])
    .optional(),
  tags: z.array(z.string()).default([]),
  readme: z.string().optional(),
});

export const NativeSkillSchema = UnifiedSkillSchema.extend({
  meta: NativeSkillMetaSchema.default({}),
});

export type NativeSkillMeta = z.infer<typeof NativeSkillMetaSchema>;
export type NativeSkillConfig = z.infer<typeof NativeSkillSchema>;