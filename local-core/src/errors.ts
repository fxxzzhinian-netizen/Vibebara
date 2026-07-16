export type LocalCoreErrorCode =
  | "WRITE_ROOT_FORBIDDEN"
  | "PATH_NOT_FOUND"
  | "NOT_A_DIRECTORY"
  | "INSTALL_EXISTS"
  | "IO_ERROR"
  | "UNSUPPORTED_TOOL"
  | "BAD_REQUEST";

export class LocalCoreError extends Error {
  constructor(
    public readonly code: LocalCoreErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "LocalCoreError";
  }
}
