import { readFolder, writeSkill, type FilePayload } from "@vibebara/local-core";
import { CloudClient } from "../cloud/client.js";
import type {
  MergeApplyResponse,
  MergePreviewResponse,
  MergedContent,
  PullUpdateResponse,
  UserSkillDeploymentInfo,
} from "../cloud/types.js";
import { CliError, EXIT } from "../errors.js";
import type { DeploymentSelector } from "../resolve.js";
import {
  collaborationContext,
  deploymentTool,
  writeResources,
} from "./context.js";

export interface MergeOptions extends DeploymentSelector {
  cloudApiBase?: string;
}

export interface PreparedMerge {
  client: CloudClient;
  deployment: UserSkillDeploymentInfo;
  files: FilePayload[];
  preview: MergePreviewResponse;
}

export async function prepareMerge(
  options: MergeOptions,
): Promise<PreparedMerge> {
  const { client, deployment } = await collaborationContext(options);
  const folder = readFolder({ path: deployment.install_path, include: "all" });
  const preview = await client.post<MergePreviewResponse>(
    `/skill-deployments/${deployment.id}/merge-preview`,
    { currentHash: folder.dirHash, files: folder.files },
  );
  if (!preview.success || !preview.merged) {
    throw new CliError(preview.error || "合并预览失败", EXIT.GENERAL, preview);
  }
  return { client, deployment, files: folder.files, preview };
}

export async function applyMerge(
  prepared: PreparedMerge,
  merged: MergedContent = prepared.preview.merged!,
): Promise<PullUpdateResponse> {
  const { client, deployment, files, preview } = prepared;
  const apply = await client.post<MergeApplyResponse>(
    `/skill-deployments/${deployment.id}/merge-apply`,
    {
      files,
      merged,
      expectedTheirsHash: preview.theirs_hash,
    },
  );
  if (!apply.success || !apply.artifact) {
    throw new CliError(
      apply.error || "合并提交失败",
      apply.conflict ? EXIT.CONFLICT : EXIT.GENERAL,
      apply,
    );
  }

  const artifact = apply.artifact;
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
    `/skill-deployments/${deployment.id}/commit-merge`,
    {
      installedHash: written.installedHash,
      repoHash: artifact.repo_hash,
      repoVersion: artifact.repo_version,
      abstractSnapshot: artifact.abstract_snapshot,
    },
  );
  if (!response.success) {
    throw new CliError(
      response.error || "合并登记失败",
      response.conflict ? EXIT.CONFLICT : EXIT.GENERAL,
      response,
    );
  }
  return response;
}
