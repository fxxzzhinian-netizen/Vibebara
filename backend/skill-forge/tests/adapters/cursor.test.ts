import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CursorAdapter } from "../../src/adapters/cursor.js";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("CursorAdapter", () => {
  let tmpDir: string;
  let adapter: CursorAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-cursor-"));
    adapter = new CursorAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Cursor",
      instructions: "# Test Skill\n\nDo the thing.",
      triggers: { disableModelInvocation: false },
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates SKILL.md with correct frontmatter", async () => {
    const result = await adapter.build(config, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter, body } = parseFrontmatter(skillMd);

    expect(frontmatter["name"]).toBe("test-skill");
    expect(frontmatter["description"]).toBe("A test skill for Cursor");
    expect(frontmatter["disable-model-invocation"]).toBe(false);
    expect(body).toContain("# Test Skill");
  });

  it("includes SKILL.md in file list", async () => {
    const result = await adapter.build(config, tmpDir);
    expect(result.files).toContain("SKILL.md");
  });

  it("creates output in correct directory", async () => {
    const result = await adapter.build(config, tmpDir);
    expect(result.outputDir).toBe(path.join(tmpDir, "test-skill"));
  });

  it("applies cursor target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { cursor: { description: "Overridden for Cursor" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Cursor");
  });

  it("returns correct deploy directory", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(path.join(os.homedir(), ".cursor", "skills"));
  });
});
