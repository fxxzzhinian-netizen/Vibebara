import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UserSkillDeploymentInfo } from "../src/cloud/types.js";
import {
  assertSameMachine,
  detectRepositoryRoot,
  resolveDeployment,
} from "../src/resolve.js";

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vibe-cli-")));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function deployment(installPath: string): UserSkillDeploymentInfo {
  return {
    id: "dep-1",
    user_id: "user-1",
    project_id: "project-1",
    team_skill_id: "demo",
    skill_name: "Demo",
    tool_type: "cursor",
    deploy_path: root,
    install_path: installPath,
    repo_version: 1,
    repo_hash: "repo",
    installed_hash: "installed",
    status: "synced",
    tracking_enabled: true,
    local_dirty: false,
    last_seen_at: null,
    created_at: null,
    updated_at: null,
  };
}

describe("repository/deployment resolution", () => {
  it("uses the nearest tool marker before an outer .git", () => {
    fs.mkdirSync(path.join(root, ".git"));
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(path.join(nested, ".cursor", "skills"), { recursive: true });
    expect(detectRepositoryRoot(path.join(nested, "src"))).toBe(nested);
  });

  it("resolves by cwd and rejects ambiguous matches", () => {
    fs.mkdirSync(path.join(root, ".git"));
    const item = deployment(path.join(root, ".cursor", "skills", "demo"));
    expect(resolveDeployment([item], { cwd: root }).id).toBe("dep-1");
    expect(() =>
      resolveDeployment([item, { ...item, id: "dep-2" }], { cwd: root }),
    ).toThrow(/消歧/);
  });
});

describe("same-machine lock", () => {
  it("accepts a matching local skill and rejects a missing path", () => {
    const install = path.join(root, ".cursor", "skills", "demo");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(path.join(install, "SKILL.md"), "demo");
    expect(() => assertSameMachine(deployment(install))).not.toThrow();
    expect(() =>
      assertSameMachine(deployment(path.join(root, "missing"))),
    ).toThrow(/暂不支持跨机/);
  });
});
