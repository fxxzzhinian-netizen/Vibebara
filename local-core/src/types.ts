export type ToolType =
  | "cursor"
  | "codex"
  | "windsurf"
  | "claude"
  | "kiro"
  | "trae"
  | "qoder"
  | "workbuddy";

export type DeployScope = "project" | "platform";
export type ContentEncoding = "utf8" | "base64";
export type ResourceTransfer = "inline" | "url";

export interface FilePayload {
  path: string;
  encoding: ContentEncoding;
  content: string;
}

export interface ResourcePayload {
  path: string;
  transfer: ResourceTransfer;
  encoding?: ContentEncoding;
  content?: string;
  url?: string;
  sha256?: string;
  size?: number;
}

export interface ReadFolderOptions {
  path: string;
  include?: "skill" | "all";
}

export interface ReadFolderResult {
  root: string;
  dirHash: string;
  files: FilePayload[];
}

export interface WriteSkillOptions {
  deployPath?: string;
  scope: DeployScope;
  tool: ToolType;
  skillId: string;
  contents: Record<string, string>;
  resources: ResourcePayload[];
  overwrite?: boolean;
  ensureGitignore?: boolean;
}

export interface WriteSkillResult {
  installPath: string;
  written: string[];
  installedHash: string;
}
