import path from "node:path";
import { exists, readFile } from "../utils/fs.js";
import { parseFrontmatter } from "../utils/yaml.js";

export type SkillOrigin =
  | "cursor"
  | "codex"
  | "claude"
  | "windsurf"
  | "unknown";
export type Confidence = "high" | "medium" | "low";

export interface DetectResult {
  origin: SkillOrigin;
  confidence: Confidence;
  signals: string[];
}

/**
 * 识别原生 skill 的来源平台。
 *
 * 双层判定（docs/skill-forge-design.md §8.3）：
 *   1. 来源路径主信号（+5）—— 最小化的 Cursor/Windsurf/Claude skill 结构无法区分，
 *      路径是最强信号。`skillDir` 本身即来源路径，无需额外上下文。
 *   2. frontmatter / 文件结构辅信号 —— Claude 专有字段、openai.yaml、metadata.surfaces 等。
 *
 * 取最高分平台；并列或全 0 → unknown。
 */
export async function detectOrigin(skillDir: string): Promise<DetectResult> {
  const signals: string[] = [];
  const score: Record<Exclude<SkillOrigin, "unknown">, number> = {
    cursor: 0,
    codex: 0,
    claude: 0,
    windsurf: 0,
  };

  // ---- 路径主信号（+5）----
  const norm = skillDir.replace(/\\/g, "/");
  if (/(^|\/)\.claude\/skills(\/|$)/.test(norm)) {
    score.claude += 5;
    signals.push("source path under .claude/skills/");
  }
  if (
    /(^|\/)\.codeium\/windsurf\//.test(norm) ||
    /(^|\/)\.windsurf\/skills(\/|$)/.test(norm)
  ) {
    score.windsurf += 5;
    signals.push("source path under windsurf skills dir");
  }
  if (/(^|\/)\.codex\/skills(\/|$)/.test(norm)) {
    score.codex += 5;
    signals.push("source path under .codex/skills/");
  }
  if (/(^|\/)\.cursor\/skills(\/|$)/.test(norm)) {
    score.cursor += 5;
    signals.push("source path under .cursor/skills/");
  }

  // ---- 文件结构 / frontmatter 辅信号 ----
  const hasAgentsYaml = await exists(
    path.join(skillDir, "agents", "openai.yaml"),
  );
  if (hasAgentsYaml) {
    signals.push("agents/openai.yaml present");
    score.codex += 3;
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (await exists(skillMdPath)) {
    const content = await readFile(skillMdPath);
    const { frontmatter, body } = parseFrontmatter(content);

    // disable-model-invocation 为 Cursor / Claude 共用语义 —— 单独出现时歧义，
    // 两边各 +2，需路径裁决。
    if (frontmatter["disable-model-invocation"] !== undefined) {
      signals.push("frontmatter has disable-model-invocation");
      score.cursor += 2;
      score.claude += 2;
    }

    // Claude 专有运行时字段 —— 任一出现即强烈指向 Claude。
    const claudeKeys = [
      "allowed-tools",
      "disallowed-tools",
      "user-invocable",
      "argument-hint",
      "model",
      "effort",
      "context",
      "agent",
      "hooks",
      "when_to_use",
    ];
    const matchedClaude = claudeKeys.filter(
      (k) => frontmatter[k] !== undefined,
    );
    if (matchedClaude.length > 0) {
      signals.push(`frontmatter has Claude fields: ${matchedClaude.join(", ")}`);
      score.claude += 3;
    }

    const metadata = frontmatter["metadata"] as
      | Record<string, unknown>
      | undefined;
    if (metadata?.["short-description"]) {
      signals.push("frontmatter has metadata.short-description");
      score.codex += 1;
    }
    if (metadata?.["surfaces"]) {
      signals.push("frontmatter has metadata.surfaces");
      score.cursor += 3;
    }

    if (/\$[a-z][a-z0-9-]*\b/.test(body)) {
      signals.push("instructions contain $skill-name reference");
      score.codex += 2;
    }
  }

  const hasAssetsDir = await exists(path.join(skillDir, "assets"));
  const hasReferencesDir = await exists(path.join(skillDir, "references"));

  if (hasAssetsDir) {
    signals.push("assets/ directory present");
    score.codex += 1;
  }

  if (hasReferencesDir && hasAgentsYaml) {
    signals.push("references/ + agents/ directory structure (Codex pattern)");
    score.codex += 1;
  }

  const hasFlatReference = await exists(path.join(skillDir, "reference.md"));
  const hasFlatExamples = await exists(path.join(skillDir, "examples.md"));
  if (hasFlatReference || hasFlatExamples) {
    const names = [
      hasFlatReference && "reference.md",
      hasFlatExamples && "examples.md",
    ].filter(Boolean);
    signals.push(`flat files: ${names.join(", ")} (Cursor pattern)`);
    score.cursor += 2;
  }

  // ---- 裁决 ----
  const entries = Object.entries(score) as [
    Exclude<SkillOrigin, "unknown">,
    number,
  ][];
  const max = Math.max(...entries.map(([, v]) => v));
  const winners = entries
    .filter(([, v]) => v === max && v > 0)
    .map(([k]) => k);

  let origin: SkillOrigin;
  let confidence: Confidence;

  if (max === 0) {
    origin = "unknown";
    confidence = "low";
    signals.push("no distinguishing signals found");
  } else if (winners.length > 1) {
    origin = "unknown";
    confidence = "low";
    signals.push(`ambiguous: tie between ${winners.join(", ")}`);
  } else {
    origin = winners[0];
    confidence = max >= 5 ? "high" : max >= 3 ? "medium" : "low";
  }

  return { origin, confidence, signals };
}
