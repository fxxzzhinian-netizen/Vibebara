export const EXIT = {
  OK: 0,
  GENERAL: 1,
  USAGE: 2,
  CONFLICT: 3,
  MANUAL_CONFLICT: 4,
  AUTH: 5,
  LOCAL_DISK: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode = EXIT.GENERAL,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}
