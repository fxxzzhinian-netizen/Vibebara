import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  WorkBuddyAdapter,
  resolveWorkbuddySkillsDir,
} from "../../src/adapters/workbuddy.js";
import {
  UnifiedSkillSchema,
  type UnifiedSkillConfig,
} from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("WorkBuddyAdapter", () => {
  let tmpDir: string;
  let adapter: WorkBuddyAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-workbuddy-"));
    adapter = new WorkBuddyAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for WorkBuddy",
      instructions: "# Test Skill\n\nDo the thing.",
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates SKILL.md with marketplace-style frontmatter (with fallbacks)", async () => {
    const result = await adapter.build(config, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter, body } = parseFrontmatter(skillMd);

    expect(frontmatter["name"]).toBe("test-skill");
    expect(frontmatter["description"]).toBe("A test skill for WorkBuddy");
    expect(frontmatter["version"]).toBe("1.0.0");
    // 回退：display_name←name，description_zh←description，visibility←public
    expect(frontmatter["display_name"]).toBe("test-skill");
    expect(frontmatter["description_zh"]).toBe("A test skill for WorkBuddy");
    expect(frontmatter["visibility"]).toBe("public");
    // _en 缺省省略
    expect(frontmatter["display_name_en"]).toBeUndefined();
    expect(frontmatter["description_en"]).toBeUndefined();
    expect(body).toContain("# Test Skill");
  });

  it("emits workbuddy block fields when provided", async () => {
    const rich = UnifiedSkillSchema.parse({
      ...config,
      workbuddy: {
        displayName: "测试技能",
        displayNameEn: "Test Skill",
        descriptionZh: "中文描述",
        descriptionEn: "English description",
        visibility: "private",
      },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    expect(frontmatter["display_name"]).toBe("测试技能");
    expect(frontmatter["display_name_en"]).toBe("Test Skill");
    expect(frontmatter["description_zh"]).toBe("中文描述");
    expect(frontmatter["description_en"]).toBe("English description");
    expect(frontmatter["visibility"]).toBe("private");
  });

  it("does not emit _skillhub_meta.json or _icon.svg sidecar files", async () => {
    const result = await adapter.build(config, tmpDir);
    await expect(
      fs.access(path.join(result.outputDir, "_skillhub_meta.json"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "_icon.svg"))
    ).rejects.toThrow();
  });

  it("includes SKILL.md in file list", async () => {
    const result = await adapter.build(config, tmpDir);
    expect(result.files).toContain("SKILL.md");
  });

  it("creates output in correct directory", async () => {
    const result = await adapter.build(config, tmpDir);
    expect(result.outputDir).toBe(path.join(tmpDir, "test-skill"));
  });

  it("returns the global WorkBuddy deploy directory under ~/.workbuddy/skills", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(resolveWorkbuddySkillsDir());
    expect(deployDir).toBe(path.join(os.homedir(), ".workbuddy", "skills"));
  });

  it("applies workbuddy target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { workbuddy: { description: "Overridden for WorkBuddy" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for WorkBuddy");
  });

  it("copies scripts/references/assets resources", async () => {
    const srcSkill = await fs.mkdtemp(
      path.join(os.tmpdir(), "sf-workbuddy-src-")
    );
    await fs.mkdir(path.join(srcSkill, "scripts"), { recursive: true });
    await fs.writeFile(
      path.join(srcSkill, "scripts", "run.py"),
      "print('hi')"
    );
    await fs.mkdir(path.join(srcSkill, "references"), { recursive: true });
    await fs.writeFile(path.join(srcSkill, "references", "doc.md"), "# ref");

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
