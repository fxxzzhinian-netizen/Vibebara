import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  QoderAdapter,
  resolveQoderSkillsDir,
} from "../../src/adapters/qoder.js";
import {
  UnifiedSkillSchema,
  type UnifiedSkillConfig,
} from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("QoderAdapter", () => {
  let tmpDir: string;
  let adapter: QoderAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-qoder-"));
    adapter = new QoderAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Qoder",
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
    expect(frontmatter["description"]).toBe("A test skill for Qoder");
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

  it("returns the global Qoder deploy directory under ~/.qoder/skills", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(resolveQoderSkillsDir());
    expect(deployDir).toBe(path.join(os.homedir(), ".qoder", "skills"));
  });

  it("applies qoder target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { qoder: { description: "Overridden for Qoder" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Qoder");
  });

  it("strictly outputs only name + description, dropping all other platform fields", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Qoder",
      instructions: "# Test Skill\n\nDo the thing.",
      triggers: { disableModelInvocation: true },
      metadata: {
        license: "MIT",
        compatibility: "Requires Python 3.11+",
        surfaces: ["ide"],
        author: "vibebara",
        version: "1.0.0",
      },
      ui: { brandColor: "#3B82F6", defaultPrompt: "Use $test-skill" },
      claude: { allowedTools: "Read", model: "opus", context: "fork" },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    // 仅允许 name / description 两个键，其余精确丢弃。
    expect(Object.keys(frontmatter).sort()).toEqual(["description", "name"]);
    expect(frontmatter["disable-model-invocation"]).toBeUndefined();
    expect(frontmatter["license"]).toBeUndefined();
    expect(frontmatter["compatibility"]).toBeUndefined();
    expect(frontmatter["metadata"]).toBeUndefined();
    expect(frontmatter["allowed-tools"]).toBeUndefined();
    expect(frontmatter["model"]).toBeUndefined();
    expect(frontmatter["context"]).toBeUndefined();

    // 不生成 Codex 的 openai.yaml，也不生成 LICENSE.txt。
    await expect(
      fs.access(path.join(result.outputDir, "agents", "openai.yaml"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "LICENSE.txt"))
    ).rejects.toThrow();
  });

  it("copies scripts/references/assets resources", async () => {
    const srcSkill = await fs.mkdtemp(path.join(os.tmpdir(), "sf-qoder-src-"));
    await fs.mkdir(path.join(srcSkill, "scripts"), { recursive: true });
    await fs.writeFile(
      path.join(srcSkill, "scripts", "run.py"),
      "print('hi')"
    );
    await fs.mkdir(path.join(srcSkill, "references"), { recursive: true });
    await fs.writeFile(
      path.join(srcSkill, "references", "doc.md"),
      "# ref"
    );

    const withRes = UnifiedSkillSchema.parse({
      ...config,
      resources: {
        scripts: ["scripts"],
        references: ["references"],
        assets: [],
      },
    });

    const origCwd = process.cwd();
    process.chdir(srcSkill);
    try {
      const result = await adapter.build(withRes, tmpDir);
      const script = await fs.readFile(
        path.join(result.outputDir, "scripts", "run.py"),
        "utf-8"
      );
      const ref = await fs.readFile(
        path.join(result.outputDir, "references", "doc.md"),
        "utf-8"
      );
      expect(script).toContain("print('hi')");
      expect(ref).toContain("# ref");
    } finally {
      process.chdir(origCwd);
      await fs.rm(srcSkill, { recursive: true, force: true });
    }
  });
});
