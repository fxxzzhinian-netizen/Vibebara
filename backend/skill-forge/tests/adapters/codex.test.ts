import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CodexAdapter } from "../../src/adapters/codex.js";
import { UnifiedSkillSchema, type UnifiedSkillConfig } from "../../src/schema/unified.js";
import { parseFrontmatter, parseYaml } from "../../src/utils/yaml.js";

describe("CodexAdapter", () => {
  let tmpDir: string;
  let adapter: CodexAdapter;
  let config: UnifiedSkillConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sf-codex-"));
    adapter = new CodexAdapter();
    config = UnifiedSkillSchema.parse({
      name: "test-skill",
      displayName: "Test Skill",
      description: "A test skill for Codex",
      shortDescription: "Short desc",
      instructions: "# Test Skill\n\nDo the thing.",
      ui: {
        iconSmall: "./icon-sm.svg",
        brandColor: "#3B82F6",
        defaultPrompt: "Use test-skill to do things",
      },
      dependencies: {
        tools: [
          { type: "mcp", value: "github", description: "GitHub MCP" },
        ],
      },
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates SKILL.md with metadata frontmatter", async () => {
    const result = await adapter.build(config, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter, body } = parseFrontmatter(skillMd);

    expect(frontmatter["name"]).toBe("test-skill");
    expect(frontmatter["description"]).toBe("A test skill for Codex");
    const meta = frontmatter["metadata"] as Record<string, unknown>;
    expect(meta["short-description"]).toBe("Short desc");
    expect(body).toContain("# Test Skill");
  });

  it("generates agents/openai.yaml", async () => {
    const result = await adapter.build(config, tmpDir);
    const yamlContent = await fs.readFile(
      path.join(result.outputDir, "agents", "openai.yaml"),
      "utf-8"
    );
    const agentConfig = parseYaml<Record<string, unknown>>(yamlContent);
    const iface = agentConfig["interface"] as Record<string, unknown>;

    expect(iface["display_name"]).toBe("Test Skill");
    expect(iface["short_description"]).toBe("Short desc");
    expect(iface["icon_small"]).toBe("./icon-sm.svg");
    expect(iface["brand_color"]).toBe("#3B82F6");
    expect(iface["default_prompt"]).toBe("Use test-skill to do things");
  });

  it("includes tool dependencies in agent yaml", async () => {
    const result = await adapter.build(config, tmpDir);
    const yamlContent = await fs.readFile(
      path.join(result.outputDir, "agents", "openai.yaml"),
      "utf-8"
    );
    const agentConfig = parseYaml<Record<string, unknown>>(yamlContent);
    const deps = agentConfig["dependencies"] as Record<string, unknown>;

    expect(deps["tools"]).toHaveLength(1);
    const tools = deps["tools"] as Array<Record<string, unknown>>;
    expect(tools[0]["value"]).toBe("github");
  });

  it("includes policy in agent yaml", async () => {
    const result = await adapter.build(config, tmpDir);
    const yamlContent = await fs.readFile(
      path.join(result.outputDir, "agents", "openai.yaml"),
      "utf-8"
    );
    const agentConfig = parseYaml<Record<string, unknown>>(yamlContent);
    const policy = agentConfig["policy"] as Record<string, unknown>;

    expect(policy["allow_implicit_invocation"]).toBe(true);
  });

  it("applies codex target overrides", async () => {
    const overridden = UnifiedSkillSchema.parse({
      ...config,
      targets: { codex: { description: "Overridden for Codex" } },
    });
    const result = await adapter.build(overridden, tmpDir);
    const skillMd = await fs.readFile(
      path.join(result.outputDir, "SKILL.md"),
      "utf-8"
    );
    const { frontmatter } = parseFrontmatter(skillMd);
    expect(frontmatter["description"]).toBe("Overridden for Codex");
  });

  it("returns correct deploy directory", () => {
    const deployDir = adapter.getDeployDir();
    expect(deployDir).toBe(path.join(os.homedir(), ".codex", "skills"));
  });

  it("includes correct files in result", async () => {
    const result = await adapter.build(config, tmpDir);
    expect(result.files).toContain("SKILL.md");
    expect(result.files).toContain("agents/openai.yaml");
  });
});
