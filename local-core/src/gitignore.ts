import fs from "node:fs";
import path from "node:path";

export const GITIGNORE_BLOCK = [
  "# Vibebara local skill deployments",
  ".cursor/skills/",
  ".codex/skills/",
  ".windsurf/skills/",
  ".claude/skills/",
  ".kiro/skills/",
  ".trae/skills/",
  ".qoder/skills/",
  ".workbuddy/skills/",
];

export function ensureGitignore(projectRoot: string): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  const gitignore = path.join(projectRoot, ".gitignore");
  const existing = fs.existsSync(gitignore)
    ? fs.readFileSync(gitignore, "utf8")
    : "";
  const lines = existing === "" ? [] : existing.split(/\r\n|\r|\n/);
  const missing = GITIGNORE_BLOCK.filter((line) => !lines.includes(line));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(
    gitignore,
    `${existing}${prefix}${missing.join("\n")}\n`,
    "utf8",
  );
}
