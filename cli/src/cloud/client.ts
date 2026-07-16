import { CliError, EXIT } from "../errors.js";

interface ErrorPayload {
  detail?: string;
  error?: string;
}

export class CloudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const url = `${this.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });

      const text = await response.text();
      let payload: unknown = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { error: text };
        }
      }
      if (!response.ok) {
        const error = payload as ErrorPayload;
        const message =
          error.detail ?? error.error ?? `云端请求失败 (${response.status})`;
        const exitCode =
          response.status === 401 || response.status === 403
            ? EXIT.AUTH
            : response.status === 409
              ? EXIT.CONFLICT
              : EXIT.GENERAL;
        throw new CliError(message, exitCode, {
          status: response.status,
          url,
        });
      }
      return payload as T;
    } catch (error) {
      if (error instanceof CliError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new CliError("云端请求超时", EXIT.GENERAL);
      }
      throw new CliError(
        `无法连接云端: ${(error as Error).message}`,
        EXIT.GENERAL,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}
