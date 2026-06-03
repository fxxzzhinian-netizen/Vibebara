import type { LocalAgentErrorCode, LocalAgentFailure } from "./types";

/** 错误码 → HTTP 状态码映射（与 M0 §4.0 错误码表一致）。 */
export const ERROR_HTTP_STATUS: Record<LocalAgentErrorCode, number> = {
  UNAUTHORIZED: 401,
  WRITE_ROOT_FORBIDDEN: 403,
  PATH_NOT_FOUND: 404,
  NOT_A_DIRECTORY: 400,
  INSTALL_EXISTS: 409,
  IO_ERROR: 500,
  UNSUPPORTED_TOOL: 400,
  BAD_REQUEST: 400,
};

/**
 * 统一的本地代理错误：携带契约错误码、人类可读 message 与可选 detail。
 * 路由层捕获后按 ERROR_HTTP_STATUS 映射 HTTP 状态码并序列化为 LocalAgentFailure。
 */
export class AgentError extends Error {
  readonly code: LocalAgentErrorCode;
  readonly detail?: string;

  constructor(code: LocalAgentErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.detail = detail;
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }

  toFailure(): LocalAgentFailure {
    const failure: LocalAgentFailure = {
      ok: false,
      error: { code: this.code, message: this.message },
    };
    if (this.detail !== undefined) {
      failure.error.detail = this.detail;
    }
    return failure;
  }
}
