export interface OutputOptions {
  json?: boolean;
}

export class Output {
  constructor(private readonly options: OutputOptions) {}

  get json(): boolean {
    return Boolean(this.options.json);
  }

  data(value: unknown): void {
    if (this.options.json) {
      process.stdout.write(`${JSON.stringify(value)}\n`);
      return;
    }
    if (typeof value === "string") {
      process.stdout.write(`${value}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    }
  }

  error(message: string, details?: unknown): void {
    if (this.options.json) {
      process.stderr.write(
        `${JSON.stringify({ success: false, error: message, details })}\n`,
      );
    } else {
      process.stderr.write(`错误: ${message}\n`);
      if (details !== undefined) {
        process.stderr.write(`${JSON.stringify(details, null, 2)}\n`);
      }
    }
  }
}
