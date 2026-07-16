import { computeDirHash, writeSkill } from "@vibebara/local-core";
import type {
  BuildArtifactResponse,
  PullUpdateResponse,
} from "../cloud/types.js";
import { CliError, EXIT } from "../errors.js";
import type { DeploymentSelector } from "../resolve.js";
import {
  collaborationContext,
  deploymentTool,
  writeResources,
} from "./context.js";

export interface PullOptions extends DeploymentSelector {
  cloudApiBase?: string;
  overwrite?: boolean;
}

export async function pullSkill(
  options: PullOptions,
): Promise<PullUpdateResponse> {
  const { client, deployment } = await collaborationContext(options);
  const currentHash = computeDirHash(deployment.install_path);
  if (
    currentHash &&
    currentHash !== deployment.installed_hash &&
    !options.overwrite
  ) {
    throw new CliError(
      "本地有未推送改动；确认覆盖后请加 --overwrite",
      EXIT.CONFLICT,
    );
  }

  const artifact = await client.post<BuildArtifactResponse>(
    `/skill-deployments/${deployment.id}/build-artifact`,
  );
  if (!artifact.success) {
    throw new CliError(artifact.error || "云端构建失败", EXIT.GENERAL);
  }

  const written = writeSkill({
    deployPath: deployment.deploy_path,
    scope: "project",
    tool: deploymentTool(deployment.tool_type),
    skillId: artifact.skill_id || deployment.team_skill_id,
    contents: artifact.contents,
    resources: writeResources(artifact.resources),
    overwrite: true,
    ensureGitignore: true,
  });

  const response = await client.post<PullUpdateResponse>(
    `/skill-deployments/${deployment.id}/commit-pull`,
    {
      installedHash: written.installedHash,
      repoHash: artifact.repo_hash,
      repoVersion: artifact.repo_version,
      abstractSnapshot: artifact.abstract_snapshot,
    },
  );
  if (!response.success) {
    throw new CliError(
      response.error || "拉取登记失败",
      response.conflict ? EXIT.CONFLICT : EXIT.GENERAL,
      response,
    );
  }
  return response;
}
