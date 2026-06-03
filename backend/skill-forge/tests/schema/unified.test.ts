import { describe, it, expect } from "vitest";
import { UnifiedSkillSchema } from "../../src/schema/unified.js";

describe("UnifiedSkillSchema", () => {
  const validConfig = {
    name: "my-skill",
    description: "A test skill",
    instructions: "# My Skill\nDo something.",
  };

  it("accepts a minimal valid config", () => {
    const result = UnifiedSkillSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-skill");
      expect(result.data.version).toBe("1.0.0");
      expect(result.data.triggers.disableModelInvocation).toBe(true);
      expect(result.data.triggers.allowImplicitInvocation).toBe(true);
    }
  });

  it("accepts a full config with all fields", () => {
    const full = {
      ...validConfig,
      displayName: "My Skill",
      shortDescription: "Short desc",
      version: "2.0.0",
      triggers: {
        disableModelInvocation: false,
        allowImplicitInvocation: false,
      },
      ui: {
        iconSmall: "./icon-sm.svg",
        iconLarge: "./icon-lg.png",
        brandColor: "#FF5733",
        defaultPrompt: "Use my-skill to do X",
      },
      dependencies: {
        tools: [
          {
            type: "mcp",
            value: "github",
            description: "GitHub MCP",
            transport: "streamable_http",
            url: "https://example.com",
          },
        ],
      },
      resources: {
        scripts: ["scripts/"],
        references: ["references/"],
        assets: ["assets/"],
      },
      targets: {
        cursor: { description: "Cursor override" },
        codex: { description: "Codex override" },
      },
    };
    const result = UnifiedSkillSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects invalid name format", () => {
    const result = UnifiedSkillSchema.safeParse({
      ...validConfig,
      name: "Invalid Name!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(UnifiedSkillSchema.safeParse({}).success).toBe(false);
    expect(UnifiedSkillSchema.safeParse({ name: "test" }).success).toBe(false);
    expect(
      UnifiedSkillSchema.safeParse({ name: "test", description: "desc" }).success
    ).toBe(false);
  });

  it("rejects invalid brand color", () => {
    const result = UnifiedSkillSchema.safeParse({
      ...validConfig,
      ui: { brandColor: "not-a-color" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 64 characters", () => {
    const result = UnifiedSkillSchema.safeParse({
      ...validConfig,
      name: "a".repeat(65),
    });
    expect(result.success).toBe(false);
  });
});
