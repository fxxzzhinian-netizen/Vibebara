import fs from "node:fs";
import path from "node:path";

/**
 * 维护 deployPath/.gitignore 的 VibeHub 块 —— 逐行复刻 backend
 * project_service._ensure_gitignore（:81-94）：仅追加缺失行，不重写已有内容。
 */
export const GITIGNORE_BLOCK = [
  "# VibeHub local skill deployments",
  ".cursor/skills/",
  ".codex/skills/",
];

/** Python str.splitlines() 等价：按 \r\n / \r / \n 分行。 */
function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split(/\r\n|\r|\n/);
}

export function ensureGitignore(projectRoot: string): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  const gitignore = path.join(projectRoot, ".gitignore");
  const existing = fs.existsSync(gitignore)
    ? fs.readFileSync(gitignore, "utf-8")
    : "";
  const lines = splitLines(existing);
  const missing = GITIGNORE_BLOCK.filter((line) => !lines.includes(line));
  if (missing.length === 0) {
    return;
  }
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  const block = missing.join("\n");
  const suffix = !block.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(gitignore, `${existing}${prefix}${block}${suffix}`, "utf-8");
}
