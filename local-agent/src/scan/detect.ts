import fs from "node:fs";
import path from "node:path";
import type { OriginConfidence, SkillOrigin } from "../types";
import { parseFrontmatter } from "./frontmatter";

/**
 * skill 来源识别 —— **逐字移植** skill-forge src/adapters/detect.ts::detectOrigin
 * （R1：scan 纯 TS 下沉到本地代理）。评分/信号/置信度判定与云端 bridge 完全一致，
 * 便于云端复用 scan 输出。
 */

export interface DetectResult {
  origin: SkillOrigin;
  confidence: OriginConfidence;
  signals: string[];
}

function existsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function detectOrigin(skillDir: string): DetectResult {
  const signals: string[] = [];
  let cursorScore = 0;
  let codexScore = 0;

  const hasAgentsYaml = existsSync(path.join(skillDir, "agents", "openai.yaml"));
  if (hasAgentsYaml) {
    signals.push("agents/openai.yaml present");
    codexScore += 3;
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, "utf-8");
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

  const hasAssetsDir = existsSync(path.join(skillDir, "assets"));
  const hasReferencesDir = existsSync(path.join(skillDir, "references"));

  if (hasAssetsDir) {
    signals.push("assets/ directory present");
    codexScore += 1;
  }

  if (hasReferencesDir && hasAgentsYaml) {
    signals.push("references/ + agents/ directory structure (Codex pattern)");
    codexScore += 1;
  }

  const hasFlatReference = existsSync(path.join(skillDir, "reference.md"));
  const hasFlatExamples = existsSync(path.join(skillDir, "examples.md"));
  if (hasFlatReference || hasFlatExamples) {
    const names = [
      hasFlatReference && "reference.md",
      hasFlatExamples && "examples.md",
    ].filter(Boolean);
    signals.push(`flat files: ${names.join(", ")} (Cursor pattern)`);
    cursorScore += 2;
  }

  let origin: SkillOrigin;
  let confidence: OriginConfidence;

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
