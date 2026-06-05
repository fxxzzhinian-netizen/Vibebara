import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { KiroAdapter } from "../../src/adapters/kiro.js";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("KiroAdapter", () => {
  let tmpDir: string;
  let adapter: KiroAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-kiro-"));
    adapter = new KiroAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Kiro",
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
    expect(frontmatter["description"]).toBe("A test skill for Kiro");
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

  it("returns the global Kiro deploy directory under ~/.kiro", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(path.join(os.homedir(), ".kiro", "skills"));
  });

  it("applies kiro target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { kiro: { description: "Overridden for Kiro" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Kiro");
  });

  it("emits standard Agent Skills metadata (license/compatibility/metadata) when present", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Kiro",
      instructions: "# Test Skill\n\nDo the thing.",
      metadata: {
        license: "MIT",
        compatibility: "Requires Python 3.11+",
        author: "vibehub",
        version: "1.0.0",
      },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    expect(frontmatter["license"]).toBe("MIT");
    expect(frontmatter["compatibility"]).toBe("Requires Python 3.11+");
    expect(frontmatter["metadata"]).toEqual({
      author: "vibehub",
      version: "1.0.0",
    });
  });

  it("drops ui/claude/policy/surfaces fields and emits no LICENSE.txt or openai.yaml", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Kiro",
      instructions: "# Test Skill\n\nDo the thing.",
      triggers: { disableModelInvocation: true },
      metadata: { license: "MIT", surfaces: ["ide"], author: "vibehub" },
      ui: { brandColor: "#3B82F6", defaultPrompt: "Use $test-skill" },
      claude: { allowedTools: "Read", model: "opus", context: "fork" },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    // 允许的键：name / description / license / metadata（author）
    expect(Object.keys(frontmatter).sort()).toEqual([
      "description",
      "license",
      "metadata",
      "name",
    ]);
    // 严格删除清单：无 surfaces / disable-model-invocation / ui / claude 字段
    expect(frontmatter["disable-model-invocation"]).toBeUndefined();
    expect(frontmatter["allowed-tools"]).toBeUndefined();
    expect(frontmatter["model"]).toBeUndefined();
    expect(frontmatter["context"]).toBeUndefined();
    expect((frontmatter["metadata"] as Record<string, unknown>)["surfaces"]).toBeUndefined();

    await expect(
      fs.access(path.join(result.outputDir, "agents", "openai.yaml"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "LICENSE.txt"))
    ).rejects.toThrow();
  });
});
