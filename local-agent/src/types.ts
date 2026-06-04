/**
 * 本地代理 API 类型 —— 与 docs/方案B-桌面客户端迁移/contracts/local-agent-api.md
 * 的 TypeScript interface **逐字对齐**（camelCase）。这是 M3 实现的权威字段形状，
 * 与契约不得单边偏移。
 */

export type LocalAgentApiVersion = "local-agent/v1";

/** 支持的工具平台（对应后端 SUPPORTED_TOOLS = {"cursor","codex","windsurf","claude"}） */
export type ToolType = "cursor" | "codex" | "windsurf" | "claude";

/** 部署落点：项目目录 or 平台目录（~/.cursor/skills 等） */
export type DeployScope = "project" | "platform";

/** 文件内容编码（read-folder / write-skill 公用） */
export type ContentEncoding = "utf8" | "base64";

/** 资源传输模式：inline=内容随请求；url=本地代理向云端下载 */
export type ResourceTransfer = "inline" | "url";

/** 统一错误码 */
export type LocalAgentErrorCode =
  | "UNAUTHORIZED" // 401 缺失/无效配对令牌
  | "WRITE_ROOT_FORBIDDEN" // 403 目标路径不在可写根白名单
  | "PATH_NOT_FOUND" // 404 路径不存在
  | "NOT_A_DIRECTORY" // 400 期望目录但不是目录
  | "INSTALL_EXISTS" // 409 install 目录已存在且未 overwrite
  | "IO_ERROR" // 500 读写失败
  | "UNSUPPORTED_TOOL" // 400 tool 非 cursor/codex/windsurf/claude
  | "BAD_REQUEST"; // 400 参数缺失/非法

export interface LocalAgentError {
  code: LocalAgentErrorCode;
  message: string;
  detail?: string;
}

/** 失败响应统一形态 */
export interface LocalAgentFailure {
  ok: false;
  error: LocalAgentError;
}

/** 成功响应基类（各端点在此基础上扩展字段） */
export interface LocalAgentSuccessBase {
  ok: true;
  apiVersion?: LocalAgentApiVersion;
}

export type LocalAgentResponse<TSuccess extends LocalAgentSuccessBase> =
  | TSuccess
  | LocalAgentFailure;

/** 一个文件的内容载荷（read-folder 输出 / write-skill 资源） */
export interface FilePayload {
  /** 相对 root 的 POSIX 路径（正斜杠分隔），如 "assets/icon.png" */
  path: string;
  encoding: ContentEncoding;
  /** encoding=utf8 时为原始字符串（UTF-8、无 BOM、保留原始换行）；
   *  encoding=base64 时为标准 base64（无换行） */
  content: string;
}

// ---------------------------------------------------------------------------
// 2. GET /local/health
// ---------------------------------------------------------------------------

export interface HealthResponse extends LocalAgentSuccessBase {
  agentVersion: string;
  apiVersion: LocalAgentApiVersion;
  platform: NodeJS.Platform | string;
  paired: boolean;
  platformSkillDirs: {
    cursor: string;
    codex: string;
    windsurf: string;
    claude: string;
  };
}

// ---------------------------------------------------------------------------
// 3. GET /local/browse
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  absPath: string;
  isDrive: boolean;
}

export interface BrowseResponse extends LocalAgentSuccessBase {
  current: string;
  parent: string | null;
  dirs: DirEntry[];
  note?: string;
}

// ---------------------------------------------------------------------------
// 4. POST /local/scan
// ---------------------------------------------------------------------------

export interface ScanRequest {
  rootDir: string;
}

export type SkillOrigin = "cursor" | "codex" | "unknown";
export type OriginConfidence = "high" | "medium" | "low";

export interface InstalledAtStatus {
  cursor: boolean;
  codex: boolean;
  windsurf: boolean;
  claude: boolean;
}

export interface UnifiedSkillPackage {
  id: string;
  origin: SkillOrigin;
  originConfidence: OriginConfidence;
  originSignals: string[];
  sourcePath: string;
  name: string;
  displayName: string;
  description: string;
  shortDescription: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
  installedAt: InstalledAtStatus;
}

export interface ScanResponse extends LocalAgentSuccessBase {
  status: "ready" | "scanning" | "error";
  scanDir: string;
  lastScan: string | null;
  packages: UnifiedSkillPackage[];
  scanError?: string | null;
}

// ---------------------------------------------------------------------------
// 5. POST /local/read-folder
// ---------------------------------------------------------------------------

export interface ReadFolderRequest {
  path: string;
  include?: "skill" | "all";
}

export interface ReadFolderResponse extends LocalAgentSuccessBase {
  root: string;
  dirHash: string;
  files: FilePayload[];
}

// ---------------------------------------------------------------------------
// 6. POST /local/write-skill
// ---------------------------------------------------------------------------

export interface ResourcePayload {
  path: string;
  transfer: ResourceTransfer;
  encoding?: ContentEncoding;
  content?: string;
  url?: string;
  sha256?: string;
  size?: number;
}

export interface WriteSkillRequest {
  deployPath?: string;
  scope: DeployScope;
  tool: ToolType;
  skillId: string;
  contents: Record<string, string>;
  resources: ResourcePayload[];
  overwrite?: boolean;
  ensureGitignore?: boolean;
}

export interface WriteSkillResponse extends LocalAgentSuccessBase {
  installPath: string;
  written: string[];
  installedHash: string;
}

// ---------------------------------------------------------------------------
// 7. POST /local/hash
// ---------------------------------------------------------------------------

export interface HashRequest {
  paths: string[];
}

export interface HashResult {
  path: string;
  hash: string;
  exists: boolean;
}

export interface HashResponse extends LocalAgentSuccessBase {
  results: HashResult[];
}

// ---------------------------------------------------------------------------
// 8. WS /local/watch
// ---------------------------------------------------------------------------

export interface WatchSubscription {
  deploymentId: string;
  installPath: string;
  installedHash: string;
}

export type WatchClientMessage =
  | { op: "subscribe"; deployments: WatchSubscription[] }
  | { op: "unsubscribe"; deploymentIds: string[] }
  | { op: "ping" };

export type WatchEventType = "changed" | "missing" | "unchanged" | "error";

export interface WatchServerEvent {
  type: WatchEventType;
  deploymentId: string;
  installPath: string;
  currentHash: string;
  dirty: boolean;
  exists: boolean;
  ts: string;
  error?: string;
}

export type WatchServerMessage =
  | WatchServerEvent
  | { type: "pong" }
  | { type: "subscribed"; deploymentIds: string[] };
