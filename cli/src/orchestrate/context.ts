import { CloudClient } from "../cloud/client.js";
import type {
  ResourcePayload,
  ToolType,
} from "@vibebara/local-core";
import type {
  CloudResourceItem,
  DeploymentListResponse,
  UserSkillDeploymentInfo,
} from "../cloud/types.js";
import { requireCloudConfig } from "../config.js";
import { CliError, EXIT } from "../errors.js";
import {
  assertSameMachine,
  resolveDeployment,
  type DeploymentSelector,
} from "../resolve.js";

export interface CollaborationContext {
  client: CloudClient;
  deployment: UserSkillDeploymentInfo;
}

const TOOLS = new Set<ToolType>([
  "cursor",
  "codex",
  "windsurf",
  "claude",
  "kiro",
  "trae",
  "qoder",
  "workbuddy",
]);

export function deploymentTool(value: string): ToolType {
  if (!TOOLS.has(value as ToolType)) {
    throw new CliError(`部署使用了不支持的工具类型: ${value}`, EXIT.GENERAL);
  }
  return value as ToolType;
}

export function writeResources(
  resources: CloudResourceItem[],
): ResourcePayload[] {
  return resources.map((resource) => ({
    path: resource.path,
    transfer: resource.transfer || "inline",
    encoding: resource.encoding,
    content: resource.content,
    url: resource.url,
    sha256: resource.sha256,
    size: resource.size,
  }));
}

export async function collaborationContext(
  selector: DeploymentSelector & { cloudApiBase?: string },
): Promise<CollaborationContext> {
  const config = requireCloudConfig({ cloudApiBase: selector.cloudApiBase });
  const client = new CloudClient(config.cloudApiBase, config.apiKey);
  const response = await client.get<DeploymentListResponse>(
    "/skill-deployments/mine",
  );
  if (!response.success) {
    throw new CliError(response.error || "部署列表读取失败", EXIT.GENERAL);
  }
  const deployment = resolveDeployment(response.deployments, selector);
  assertSameMachine(deployment);
  return { client, deployment };
}
