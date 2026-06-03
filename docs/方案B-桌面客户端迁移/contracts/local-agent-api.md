# 本地代理 API 契约（机器可读 · 冻结版）

> 配套设计文档：[`../M0-解耦设计与接口契约.md`](../M0-解耦设计与接口契约.md)。
>
> 本文用 **TypeScript interface** 形式给出本地代理（Local Agent）全部请求/响应类型，供 **M3（本地代理实现）** 与 **M4（前端本地代理 client）** 直接复用。字段与设计文档 §4 严格一致；如有冲突以本文与设计文档**同步修订**为准，二者不得单边偏移。
>
> 约定：
> - Base：`http://127.0.0.1:<PORT>`，前缀 `/local`，版本 `local-agent/v1`。
> - 所有字段命名 **camelCase**；时间为 ISO-8601 UTC 字符串。
> - 鉴权：除 `GET /local/health` 外，所有端点需请求头 `X-Pairing-Token: <token>`。
> - 内容类型：`application/json; charset=utf-8`。
> - 这些类型也可直接抽到 `@vibehub/local-agent-contract` 共享包，云端无需依赖（云端只需镜像 §云端协作端点的 DTO）。

---

## 1. 通用类型

```ts
/** 本地代理 API 版本标识 */
export type LocalAgentApiVersion = "local-agent/v1";

/** 支持的工具平台（对应后端 SUPPORTED_TOOLS = {"cursor","codex"}） */
export type ToolType = "cursor" | "codex";

/** 部署落点：项目目录 or 平台目录（~/.cursor/skills 等） */
export type DeployScope = "project" | "platform";

/** 文件内容编码（read-folder / write-skill 公用） */
export type ContentEncoding = "utf8" | "base64";

/** 资源传输模式：inline=内容随请求；url=本地代理向云端下载 */
export type ResourceTransfer = "inline" | "url";

/** 统一错误码 */
export type LocalAgentErrorCode =
  | "UNAUTHORIZED"          // 401 缺失/无效配对令牌
  | "WRITE_ROOT_FORBIDDEN"  // 403 目标路径不在可写根白名单
  | "PATH_NOT_FOUND"        // 404 路径不存在
  | "NOT_A_DIRECTORY"       // 400 期望目录但不是目录
  | "INSTALL_EXISTS"        // 409 install 目录已存在且未 overwrite
  | "IO_ERROR"              // 500 读写失败
  | "UNSUPPORTED_TOOL"      // 400 tool 非 cursor/codex
  | "BAD_REQUEST";          // 400 参数缺失/非法

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
  /** 可选：响应所用 API 版本，便于前端做兼容判断 */
  apiVersion?: LocalAgentApiVersion;
}

/** 任一端点响应：成功扩展类型 | 统一失败类型 */
export type LocalAgentResponse<TSuccess extends LocalAgentSuccessBase> =
  | TSuccess
  | LocalAgentFailure;

/** 请求头（类型层面备注） */
export interface LocalAgentAuthHeaders {
  "X-Pairing-Token": string;
}

/** 一个文件的内容载荷（read-folder 输出 / write-skill 资源） */
export interface FilePayload {
  /** 相对 root 的 POSIX 路径（正斜杠分隔），如 "assets/icon.png" */
  path: string;
  encoding: ContentEncoding;
  /** encoding=utf8 时为原始字符串（UTF-8、无 BOM、保留原始换行）；
   *  encoding=base64 时为标准 base64（无换行） */
  content: string;
}
```

---

## 2. `GET /local/health` — 存活探测

> 鉴权：**无需**配对令牌（用于配对前探测端口存活）。

```ts
export interface HealthResponse extends LocalAgentSuccessBase {
  agentVersion: string;            // 桌面客户端/代理语义化版本，如 "1.0.0"
  apiVersion: LocalAgentApiVersion;
  platform: NodeJS.Platform | string; // "win32" | "darwin" | "linux" | ...
  paired: boolean;                 // 是否已完成配对（已注入 pairingSecret）
  /** 本机平台 skill 目录（由代理解析用户 home，对应后端 CURSOR/CODEX_SKILLS_DIR） */
  platformSkillDirs: {
    cursor: string;                // 如 "C:\\Users\\me\\.cursor\\skills"
    codex: string;                 // 如 "C:\\Users\\me\\.codex\\skills"
  };
}
```

---

## 3. `GET /local/browse?path=<abs>` — 目录浏览

> 精确复刻后端 `skill_forge_service.browse_directory`。`path` 省略/为空：Windows 返回盘符，POSIX 返回 `/`。

```ts
export interface BrowseQuery {
  path?: string; // 绝对路径；空 → 顶层（盘符或根）
}

export interface DirEntry {
  name: string;     // 目录名或盘符名（如 "C:"）
  absPath: string;  // 绝对路径
  isDrive: boolean; // 是否为盘符项（Windows 顶层）
}

export interface BrowseResponse extends LocalAgentSuccessBase {
  current: string;        // 当前目录绝对路径（顶层盘符列表时为 ""）
  parent: string | null;  // 父目录；到根时为 null
  dirs: DirEntry[];       // 已过滤：跳过非目录 / "." 开头 / node_modules,__pycache__,.git,dist,build
  note?: string;          // 如 "权限不足"
}
```

---

## 4. `POST /local/scan` — 扫描已装/可导入 Skill

> 替代 `GET /skill-forge/packages` + `/rescan` + `/teams/{tid}/skills/scan-local`。
> 字段与后端 `UnifiedSkillPackage` 对齐（camelCase）。扫描/origin 识别逻辑由纯 TS 实现（不内嵌 Node 构建）。

```ts
export interface ScanRequest {
  rootDir: string; // 要扫描的本地目录绝对路径
}

export type SkillOrigin = "cursor" | "codex" | "unknown";
export type OriginConfidence = "high" | "medium" | "low";

export interface InstalledAtStatus {
  cursor: boolean; // 该 skill 是否已装到 ~/.cursor/skills/{id}
  codex: boolean;  // 是否已装到 $CODEX_HOME|~/.codex/skills/{id}
}

export interface UnifiedSkillPackage {
  id: string;
  origin: SkillOrigin;
  originConfidence: OriginConfidence;
  originSignals: string[];
  sourcePath: string;        // 该 skill 文件夹绝对路径
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
  lastScan: string | null;          // ISO-8601
  packages: UnifiedSkillPackage[];
  scanError?: string | null;        // status=error 时的原因
}
```

---

## 5. `POST /local/read-folder` — 读取本地文件夹内容

> 用于 import（§3.5）/ push / promote（§3.2）。递归读取一个 skill 文件夹全部文件。

```ts
export interface ReadFolderRequest {
  path: string;             // skill 文件夹绝对路径
  /** "skill"=仅 skill 相关文件（SKILL.md/agents/scripts/references/assets/LICENSE）；
   *  "all"=该目录下全部常规文件。默认 "all"（与 hash 口径一致，最稳妥） */
  include?: "skill" | "all";
}

export interface ReadFolderResponse extends LocalAgentSuccessBase {
  root: string;             // = 请求 path 的 realpath
  /** 对 root 用统一 hash 算法（见设计文档 §7）计算的目录 hash，便于云端核对 */
  dirHash: string;
  files: FilePayload[];     // path 为相对 root 的 POSIX 路径
}
```

---

## 6. `POST /local/write-skill` — 落盘部署产物（核心写端点）

> 替代 `NativeSkillStore.deploy` 写盘段。覆盖语义：先删 installPath 再重建写入。

```ts
/** 资源文件下发项：transfer=inline 用 encoding+content；transfer=url 用 url+sha256+size */
export interface ResourcePayload {
  path: string;                 // 相对 install 根的 POSIX 路径，如 "assets/icon.png"
  transfer: ResourceTransfer;   // "inline"（M3 默认）| "url"（预留）
  // transfer = "inline"
  encoding?: ContentEncoding;
  content?: string;
  // transfer = "url"
  url?: string;                 // 云端下载地址（本地代理带 Bearer 拉取）
  sha256?: string;              // 下载后校验
  size?: number;                // 字节数（可选校验）
}

export interface WriteSkillRequest {
  /** scope=project 时必填：本地项目根目录绝对路径 */
  deployPath?: string;
  scope: DeployScope;           // "project" | "platform"
  tool: ToolType;               // cursor | codex
  skillId: string;
  /** 构建产物文本：相对 install 根的 POSIX 路径 → UTF-8 文本（对应 bridge contents） */
  contents: Record<string, string>;
  /** 资源文件（可含二进制）；空数组表示无资源 */
  resources: ResourcePayload[];
  overwrite?: boolean;          // 默认 false；目录已存在且 false → INSTALL_EXISTS
  /** 仅 scope=project 生效：维护 deployPath/.gitignore 的 VibeHub 块 */
  ensureGitignore?: boolean;
}

export interface WriteSkillResponse extends LocalAgentSuccessBase {
  installPath: string;          // 实际落盘目录：{deployPath}/.{tool}/skills/{skillId} 或平台目录/{skillId}
  written: string[];            // 已写入的相对路径列表（contents + resources）
  /** 落盘后立即用统一算法计算的 install 目录 hash（= 后端 installed_hash）
   *  顺带返回可省一次 /local/hash 往返 */
  installedHash: string;
}
```

---

## 7. `POST /local/hash` — 计算内容 hash（dirty 检测）

> 统一算法见设计文档 §7。路径不存在/空目录 → `hash:""`、`exists:false`。

```ts
export interface HashRequest {
  paths: string[]; // 目录或文件的绝对路径
}

export interface HashResult {
  path: string;
  hash: string;    // 统一 sha256 hex；不存在或空目录为 ""
  exists: boolean;
}

export interface HashResponse extends LocalAgentSuccessBase {
  results: HashResult[];
}
```

---

## 8. `WS /local/watch` — 本地变更事件流

> 替代后端部署轮询（`file_watcher_service._deployment_poll_loop`）。握手需 `X-Pairing-Token`（或 query `pairingToken`）。
> 协议：客户端发送 `WatchClientMessage`，代理推送 `WatchServerEvent`。

```ts
/** 订阅项：代理 watch installPath，事件触发即本地重算 hash 与 installedHash 比对 */
export interface WatchSubscription {
  deploymentId: string;
  installPath: string;
  installedHash: string; // 部署/拉取时本地算并存云端 DB 的基线
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
  currentHash: string;       // 本地实时计算
  dirty: boolean;            // = exists && currentHash != installedHash
  exists: boolean;
  ts: string;                // ISO-8601
  error?: string;            // type=error 时
}

export type WatchServerMessage =
  | WatchServerEvent
  | { type: "pong" }
  | { type: "subscribed"; deploymentIds: string[] };
```

---

## 9. 云端协作端点 DTO（前端编排所需的新增/改造云端契约）

> 这些是**云端 `/api/v1`** 侧为配合薄代理而新增/改造的请求/响应 DTO（C 类）。在此镜像列出，便于 M4 前端把「云端产物 → 本地落盘 → 云端登记」串成一条编排链。**云端实现属 M1，本节仅冻结字段形状。**

```ts
/** 资源清单项：云端把 Store 的 scripts/references/assets 随产物下发给前端，再转交 write-skill */
export interface CloudResourceItem {
  path: string;                 // 相对 install 根，如 "assets/icon.png"
  transfer: ResourceTransfer;   // 默认 "inline"
  encoding?: ContentEncoding;
  content?: string;
  url?: string;
  sha256?: string;
  size?: number;
}

/** 抽象快照（云端权威生成；deploy/pull 由云端从构建产物直接产出，免本地回传） */
export type AbstractSnapshot = Record<string, unknown>;

/** ① 云端构建产物（不写盘、不登记）
 *  POST /api/v1/projects/{pid}/skills/{sid}/build-artifact  body: { tool }
 *  亦用于 pull：POST /api/v1/skill-deployments/{id}/build-artifact */
export interface BuildArtifactResponse {
  success: boolean;
  skillId: string;
  tool: ToolType;
  contents: Record<string, string>;   // 构建产物文本（bridge contents）
  resources: CloudResourceItem[];      // Store 资源（含二进制），见设计文档 §2.4
  repoHash: string;                    // 云端 hash(store_path)
  repoVersion: number;
  abstractSnapshot: AbstractSnapshot;  // 云端从产物解析（deploy/pull 用）
  error?: string;
}

/** ④ 云端登记部署元数据（对应原 deploy_project_skill 的写库段）
 *  POST /api/v1/projects/{pid}/skills/{sid}/register-deployment */
export interface RegisterDeploymentRequest {
  tool: ToolType;
  deployPath: string;
  installPath: string;
  installedHash: string;     // 本地代理算（权威）
  repoHash: string;          // 来自 build-artifact
  repoVersion: number;
  abstractSnapshot: AbstractSnapshot;
  overwrite?: boolean;
}

/** 拉取提交（对应原 pull-update 的写库段）
 *  POST /api/v1/skill-deployments/{id}/commit-pull */
export interface CommitPullRequest {
  installedHash: string;     // 覆盖写后本地代理算
  repoHash: string;          // = teamHash
  repoVersion: number;
  abstractSnapshot: AbstractSnapshot;
}

/** 推送（接收本地 install 内容上传，云端 diff + 写回 Store）
 *  POST /api/v1/skill-deployments/{id}/push */
export interface PushDeploymentRequest {
  currentHash: string;       // 本地代理算，用于判定是否真有改动 + 新 installed_hash
  files: FilePayload[];      // 本地 read-folder 上传（含二进制 base64）
}

/** 导入（接收本地文件夹内容上传，云端落 Store）
 *  POST /api/v1/skill-forge/store/import-content */
export interface ImportContentRequest {
  files: FilePayload[];
  origin?: SkillOrigin;
  scope?: "personal" | "team";
  teamId?: string;           // scope=team 时必填
}
```

> push / register-deployment / commit-pull / import-content 的**响应**复用现有后端 schema（`PushDeploymentResponse`、`SkillDeploymentResponse`、`PullUpdateResponse`、`NativeSkillMutationResponse`），M1 落地时保持响应体不变，仅入参从「路径」改为「内容/hash」。

---

## 10. 客户端版本协商 DTO

```ts
/** GET /api/v1/version（M1 新增） */
export interface CloudVersionResponse {
  apiVersion: string;        // 如 "v1"
  minClientVersion: string;  // 低于此版本的客户端需强制更新、禁用写流程
  features?: string[];
}

/** 客户端启动自检结果（前端内部用） */
export interface ClientCompatReport {
  agentVersion: string;
  localApiVersion: LocalAgentApiVersion;
  cloudApiVersion: string;
  compatible: boolean;
  mustUpgrade: boolean;
  writeDisabled: boolean;    // 不兼容时禁用 deploy/push/pull/write-skill
}
```

---

## 11. 端点索引（速查）

| # | 方法 + 路径 | 鉴权 | 请求类型 | 响应类型 |
| --- | --- | --- | --- | --- |
| 1 | `GET /local/health` | 无 | — | `HealthResponse` |
| 2 | `GET /local/browse` | 配对令牌 | `BrowseQuery`（query） | `BrowseResponse` |
| 3 | `POST /local/scan` | 配对令牌 | `ScanRequest` | `ScanResponse` |
| 4 | `POST /local/read-folder` | 配对令牌 | `ReadFolderRequest` | `ReadFolderResponse` |
| 5 | `POST /local/write-skill` | 配对令牌 + 白名单 | `WriteSkillRequest` | `WriteSkillResponse` |
| 6 | `POST /local/hash` | 配对令牌 | `HashRequest` | `HashResponse` |
| 7 | `WS /local/watch` | 配对令牌 | `WatchClientMessage` | `WatchServerMessage` |

> 所有 HTTP 响应实际类型均为 `LocalAgentResponse<T>`（成功 `T` | 统一失败 `LocalAgentFailure`）。
