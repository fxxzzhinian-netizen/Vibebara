import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ClaudeAdapter } from "../../src/adapters/claude.js";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../../src/schema/unified.js";
import { parseFrontmatter } from "../../src/utils/yaml.js";

describe("ClaudeAdapter", () => {
  let tmpDir: string;
  let adapter: ClaudeAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-claude-"));
    adapter = new ClaudeAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      description: "A test skill for Claude Code",
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
    expect(frontmatter["description"]).toBe("A test skill for Claude Code");
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

  it("applies claude target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { claude: { description: "Overridden for Claude" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Claude");
  });

  it("returns correct deploy directory", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(path.join(os.homedir(), ".claude", "skills"));
  });

  it("maps standard metadata and Claude runtime fields into frontmatter", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "deploy",
      description: "Deploy skill",
      instructions: "# Deploy",
      metadata: {
        license: "MIT",
        compatibility: "Requires Node 20+",
        author: "vibehub",
        version: "2.0.0",
      },
      claude: {
        allowedTools: "Read, Grep, Glob",
        disallowedTools: "AskUserQuestion",
        userInvocable: false,
        argumentHint: "<env>",
        whenToUse: "When deploying",
        model: "opus",
        effort: "high",
        context: "fork",
        agent: "Explore",
        hooks: { PreToolUse: [{ matcher: "Bash" }] },
      },
    });
    const result = await adapter.build(rich, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);

    expect(frontmatter["license"]).toBe("MIT");
    expect(frontmatter["compatibility"]).toBe("Requires Node 20+");
    expect(frontmatter["metadata"]).toEqual({
      author: "vibehub",
      version: "2.0.0",
    });
    expect(frontmatter["allowed-tools"]).toBe("Read, Grep, Glob");
    expect(frontmatter["disallowed-tools"]).toBe("AskUserQuestion");
    expect(frontmatter["user-invocable"]).toBe(false);
    expect(frontmatter["argument-hint"]).toBe("<env>");
    expect(frontmatter["when_to_use"]).toBe("When deploying");
    expect(frontmatter["model"]).toBe("opus");
    expect(frontmatter["effort"]).toBe("high");
    expect(frontmatter["context"]).toBe("fork");
    expect(frontmatter["agent"]).toBe("Explore");
    expect(frontmatter["hooks"]).toBeDefined();
  });

  it("emits disable-model-invocation: true when set (default), omits when false", async () => {
    // 默认 config（schema 默认 disableModelInvocation: true）
    const onResult = await adapter.build(config, tmpDir);
    const onFm = parseFrontmatter(
      await fs.readFile(path.join(onResult.outputDir, "SKILL.md"), "utf-8")
    ).frontmatter;
    expect(onFm["disable-model-invocation"]).toBe(true);

    const off = UnifiedSkillSchema.parse({
      name: "auto-skill",
      description: "auto-invocable skill",
      instructions: "# Auto",
      triggers: { disableModelInvocation: false },
    });
    const offResult = await adapter.build(off, tmpDir);
    const offFm = parseFrontmatter(
      await fs.readFile(path.join(offResult.outputDir, "SKILL.md"), "utf-8")
    ).frontmatter;
    expect(offFm["disable-model-invocation"]).toBeUndefined();
  });

  it("drops Codex/Cursor platform artifacts (no openai.yaml, no LICENSE, no surfaces/ui)", async () => {
    const rich = UnifiedSkillSchema.parse({
      name: "deploy",
      description: "Deploy skill",
      instructions: "# Deploy",
      metadata: { license: "MIT", surfaces: ["ide"] },
      ui: { brandColor: "#3B82F6", defaultPrompt: "Use $deploy" },
    });
    const result = await adapter.build(rich, tmpDir);

    await expect(
      fs.access(path.join(result.outputDir, "agents", "openai.yaml"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "LICENSE.txt"))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(result.outputDir, "LICENSE"))
    ).rejects.toThrow();

    const { frontmatter } = parseFrontmatter(
      await fs.readFile(path.join(result.outputDir, "SKILL.md"), "utf-8")
    );
    expect(frontmatter["license"]).toBe("MIT");
    expect(frontmatter["surfaces"]).toBeUndefined();
    expect(frontmatter["brand_color"]).toBeUndefined();
    expect(frontmatter["default_prompt"]).toBeUndefined();
    expect(frontmatter["metadata"]).toBeUndefined();
  });
});
