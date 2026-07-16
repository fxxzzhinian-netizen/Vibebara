import fs from "node:fs";
import path from "node:path";
import { computeDirHash } from "@vibebara/local-core";
import { CloudClient } from "../cloud/client.js";
import type {
  DeploymentListResponse,
  UserSkillDeploymentInfo,
} from "../cloud/types.js";
import { requireCloudConfig } from "../config.js";
import { CliError, EXIT } from "../errors.js";
import type { Output } from "../output.js";

export interface StatusOptions {
  project?: string;
  cloudApiBase?: string;
}

type EffectiveStatus =
  | "synced"
  | "changed"
  | "outdated"
  | "conflict"
  | "missing"
  | "untracked";

function inspectDeployment(deployment: UserSkillDeploymentInfo) {
  const exists =
    fs.existsSync(deployment.install_path) &&
    fs.statSync(deployment.install_path).isDirectory() &&
    fs.existsSync(path.join(deployment.install_path, "SKILL.md"));
  const currentHash = exists ? computeDirHash(deployment.install_path) : "";
  const localDirty =
    exists &&
    Boolean(deployment.installed_hash) &&
    currentHash !== deployment.installed_hash;
  const repoAdvanced =
    deployment.status === "outdated" || deployment.status === "conflict";

  let status: EffectiveStatus;
  if (!deployment.tracking_enabled) status = "untracked";
  else if (!exists) status = "missing";
  else if (repoAdvanced && localDirty) status = "conflict";
  else if (repoAdvanced) status = "outdated";
  else if (localDirty) status = "changed";
  else status = "synced";

  return {
    id: deployment.id,
    skill: deployment.team_skill_id,
    name: deployment.skill_name,
    tool: deployment.tool_type,
    project: deployment.project_id,
    deploy_path: deployment.deploy_path,
    install_path: deployment.install_path,
    status,
    local_dirty: localDirty,
    exists,
    current_hash: currentHash,
    installed_hash: deployment.installed_hash,
    repo_hash: deployment.repo_hash,
  };
}

export async function statusCommand(
  options: StatusOptions,
  output: Output,
): Promise<void> {
  const config = requireCloudConfig({ cloudApiBase: options.cloudApiBase });
  const response = await new CloudClient(
    config.cloudApiBase,
    config.apiKey,
  ).get<DeploymentListResponse>("/skill-deployments/mine");
  if (!response.success) {
    throw new CliError(response.error || "部署列表读取失败", EXIT.GENERAL);
  }
  const deployments = response.deployments
    .filter((item) => !options.project || item.project_id === options.project)
    .map(inspectDeployment);

  output.data({ success: true, deployments });
}
