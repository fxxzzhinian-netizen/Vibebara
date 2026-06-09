import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WindsurfAdapter } from "../../src/adapters/windsurf.js";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("WindsurfAdapter", () => {
  let tmpDir: string;
  let adapter: WindsurfAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-windsurf-"));
    adapter = new WindsurfAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Windsurf",
      instructions: "# Test Skill\n\nDo the thing.",
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates SKILL.md with name + description frontmatter", async () => {
    const result = await adapter.build(config, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter, body } = parseFrontmatter(skillMd);

    expect(frontmatter["name"]).toBe("test-skill");
    expect(frontmatter["description"]).toBe("A test skill for Windsurf");
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

  it("applies windsurf target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { windsurf: { description: "Overridden for Windsurf" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Windsurf");
  });

  it("returns the global Windsurf deploy directory under ~/.codeium", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(
      path.join(os.homedir(), ".codeium", "windsurf", "skills")
    );
  });

  it("emits only name + description, leaking no other platform fields", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Windsurf",
      instructions: "# Test Skill\n\nDo the thing.",
      triggers: { disableModelInvocation: true },
      metadata: { license: "MIT", surfaces: ["ide"], author: "vibebara" },
      ui: { brandColor: "#3B82F6", defaultPrompt: "Use $test-skill" },
      claude: { allowedTools: "Read", model: "opus", context: "fork" },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    expect(Object.keys(frontmatter).sort()).toEqual(["description", "name"]);

    await expect(
      fs.access(path.join(result.outputDir, "agents", "openai.yaml"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "LICENSE.txt"))
    ).rejects.toThrow();
  });
});
