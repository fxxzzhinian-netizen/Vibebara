import path from "node:path";
import { exists, readFile } from "../utils/fs.js";
import { parseFrontmatter, parseYaml } from "../utils/yaml.js";

export type SkillOrigin = "cursor" | "codex" | "unknown";
export type Confidence = "high" | "medium" | "low";

export interface DetectResult {
  origin: SkillOrigin;
  confidence: Confidence;
  signals: string[];
}

export async function detectOrigin(skillDir: string): Promise<DetectResult> {
  const signals: string[] = [];
  let cursorScore = 0;
  let codexScore = 0;

  const hasAgentsYaml = await exists(
    path.join(skillDir, "agents", "openai.yaml"),
  );
  if (hasAgentsYaml) {
    signals.push("agents/openai.yaml present");
    codexScore += 3;
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (await exists(skillMdPath)) {
    const content = await readFile(skillMdPath);
    const { frontmatter, body } = parseFrontmatter(content);

    if (frontmatter["disable-model-invocation"] !== undefined) {
      signals.push("frontmatter has disable-model-invocation");
      cursorScore += 3;
    }

    const metadata = frontmatter["metadata"] as
      | Record<string, unknown>
      | undefined;
    if (metadata?.["short-description"]) {
      signals.push("frontmatter has metadata.short-description");
      codexScore += 1;
    }

    if (/\$[a-z][a-z0-9-]*\b/.test(body)) {
      signals.push("instructions contain $skill-name reference");
      codexScore += 2;
    }
  }

  const hasAssetsDir = await exists(path.join(skillDir, "assets"));
  const hasReferencesDir = await exists(path.join(skillDir, "references"));

  if (hasAssetsDir) {
    signals.push("assets/ directory present");
    codexScore += 1;
  }

  if (hasReferencesDir && hasAgentsYaml) {
    signals.push("references/ + agents/ directory structure (Codex pattern)");
    codexScore += 1;
  }

  const hasFlatReference = await exists(path.join(skillDir, "reference.md"));
  const hasFlatExamples = await exists(path.join(skillDir, "examples.md"));
  if (hasFlatReference || hasFlatExamples) {
    const names = [
      hasFlatReference && "reference.md",
      hasFlatExamples && "examples.md",
    ].filter(Boolean);
    signals.push(`flat files: ${names.join(", ")} (Cursor pattern)`);
    cursorScore += 2;
  }

  let origin: SkillOrigin;
  let confidence: Confidence;

  if (cursorScore === 0 && codexScore === 0) {
    origin = "unknown";
    confidence = "low";
    signals.push("no distinguishing signals found");
  } else if (codexScore > cursorScore) {
    origin = "codex";
    confidence = codexScore >= 3 ? "high" : "medium";
  } else if (cursorScore > codexScore) {
    origin = "cursor";
    confidence = cursorScore >= 3 ? "high" : "medium";
  } else {
    origin = "unknown";
    confidence = "low";
    signals.push("ambiguous: equal cursor/codex scores");
  }

  return { origin, confidence, signals };
}
