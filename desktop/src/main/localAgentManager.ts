import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";

/**
 * 本地代理（local-agent）子进程管理（方案 B M5-a，§4.5「本地代理进程管理」）。
 *
 * 职责：
 *   · 以 Electron 自带 Node（ELECTRON_RUN_AS_NODE=1）拉起 local-agent/dist/index.js，
 *     无需用户机预装 node；
 *   · 通过 env 注入配对令牌（VIBEHUB_PAIRING_TOKEN）、端口（VIBEHUB_LOCAL_AGENT_PORT）、
 *     可写根（VIBEHUB_WRITABLE_ROOTS）；
 *   · 启动后轮询 GET /local/health 直到就绪；
 *   · 子进程崩溃自动按退避重启（连续失败上限保护，避免重启风暴）；
 *   · 应用退出时同步清理子进程（无僵尸 node）。
 *
 * 本模块只依赖 Node 内置（child_process / http），**不 import electron**，
 * 便于在纯 node 环境用 scripts/smoke-agent.cjs 直接验证拉起/重启/清理。
 */

export interface LocalAgentManagerOptions {
  /** local-agent 入口 dist/index.js 绝对路径。 */
  agentEntry: string;
  /** 分配的监听端口（已探测空闲）。 */
  port: number;
  /** 注入的配对令牌。 */
  pairingToken: string;
  /** 启动注入的可写根（可空；写盘授权由用户确认选定的 deployPath 根登记，见 local-agent）。 */
  writableRoots?: string[];
  /** 健康探测就绪超时（毫秒）。 */
  healthTimeoutMs?: number;
  /** 日志回调（默认 console.log）。 */
  onLog?: (line: string) => void;
  /**
   * 重启前重新探测空闲端口（端口漂移支持，任务②）。
   * 默认返回 preferred 端口（不漂移，兼容无 electron 的纯 node 调用）。
   */
  findPort?: (preferred: number) => Promise<number>;
  /** 监听端口变化回调（重启漂移 / 实际监听端口与注入不一致时触发）。 */
  onPortChange?: (port: number) => void;
}

interface HealthBody {
  ok?: boolean;
  paired?: boolean;
  agentVersion?: string;
  apiVersion?: string;
  platform?: string;
}

const MAX_CONSECUTIVE_RESTARTS = 10;
const RESTART_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export class LocalAgentManager {
  private readonly opts: Required<Omit<LocalAgentManagerOptions, "onLog">> & {
    onLog: (line: string) => void;
  };
  private child: ChildProcess | null = null;
  private stopping = false;
  private restartCount = 0;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(options: LocalAgentManagerOptions) {
    this.opts = {
      agentEntry: options.agentEntry,
      port: options.port,
      pairingToken: options.pairingToken,
      writableRoots: options.writableRoots ?? [],
      healthTimeoutMs: options.healthTimeoutMs ?? 15000,
      onLog: options.onLog ?? ((l) => console.log(l)),
      findPort: options.findPort ?? ((p) => Promise.resolve(p)),
      onPortChange: options.onPortChange ?? (() => undefined),
    };
  }

  /** 更新当前端口并通知（仅在确有变化时触发 onPortChange）。 */
  private setPort(port: number): void {
    if (!Number.isFinite(port) || port <= 0 || port === this.opts.port) return;
    this.opts.onLog(`[local-agent] 端口变更 ${this.opts.port} → ${port}`);
    this.opts.port = port;
    try {
      this.opts.onPortChange(port);
    } catch (e) {
      this.opts.onLog(`[local-agent] onPortChange 回调异常: ${(e as Error)?.message}`);
    }
  }

  /** 当前监听端口。 */
  get port(): number {
    return this.opts.port;
  }

  /** 当前子进程 pid（未运行时 undefined）。 */
  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** 拉起子进程并等待 /local/health 就绪。 */
  async start(): Promise<HealthBody> {
    this.stopping = false;
    this.spawnChild();
    const health = await this.waitHealthy(this.opts.healthTimeoutMs);
    this.restartCount = 0;
    return health;
  }

  /** 同步停止：阻止重启 + 杀子进程（供 before-quit / 进程退出钩子调用）。 */
  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.killChild();
  }

  // ----------------------------------------------------------------

  private spawnChild(): void {
    const args = [this.opts.agentEntry];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // 让 Electron 二进制以纯 Node 模式运行子脚本（无需用户机预装 node）。
      ELECTRON_RUN_AS_NODE: "1",
      VIBEHUB_PAIRING_TOKEN: this.opts.pairingToken,
      VIBEHUB_LOCAL_AGENT_PORT: String(this.opts.port),
    };
    if (this.opts.writableRoots.length > 0) {
      env.VIBEHUB_WRITABLE_ROOTS = this.opts.writableRoots.join(";");
    }

    this.opts.onLog(
      `[local-agent] 拉起子进程 port=${this.opts.port} roots=${this.opts.writableRoots.length}`,
    );

    const child = spawn(process.execPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString().trimEnd();
      if (s) this.opts.onLog(`[local-agent] ${s}`);
      // 以本地代理实际监听端口为权威（覆盖 EADDRINUSE 顺延 / 漂移），热更并通知。
      const m = /监听 http:\/\/127\.0\.0\.1:(\d+)/.exec(s);
      if (m && m[1]) this.setPort(Number.parseInt(m[1], 10));
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString().trimEnd();
      if (s) this.opts.onLog(`[local-agent:err] ${s}`);
    });

    child.on("exit", (code, signal) => {
      this.opts.onLog(
        `[local-agent] 子进程退出 code=${code} signal=${signal} stopping=${this.stopping}`,
      );
      if (this.child === child) this.child = null;
      if (!this.stopping) this.scheduleRestart();
    });

    child.on("error", (err) => {
      this.opts.onLog(`[local-agent] 子进程错误: ${err.message}`);
    });
  }

  private scheduleRestart(): void {
    if (this.restartCount >= MAX_CONSECUTIVE_RESTARTS) {
      this.opts.onLog(
        `[local-agent] 连续重启达到上限(${MAX_CONSECUTIVE_RESTARTS})，停止重启`,
      );
      return;
    }
    const delay =
      RESTART_BACKOFF_MS[
        Math.min(this.restartCount, RESTART_BACKOFF_MS.length - 1)
      ];
    this.restartCount += 1;
    this.opts.onLog(
      `[local-agent] ${delay}ms 后重启（第 ${this.restartCount} 次）`,
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopping) return;
      void this.restartNow();
    }, delay);
  }

  /** 重启：重探空闲端口（可能漂移）→ 拉起 → 健康探测。 */
  private async restartNow(): Promise<void> {
    // 端口漂移：原端口若仍空闲则复用（findPort 优先 preferred），否则分到新端口。
    try {
      const next = await this.opts.findPort(this.opts.port);
      this.setPort(next);
    } catch (e) {
      this.opts.onLog(
        `[local-agent] 重启前端口探测失败，沿用旧端口: ${(e as Error)?.message}`,
      );
    }
    if (this.stopping) return;
    this.spawnChild();
    void this.waitHealthy(this.opts.healthTimeoutMs)
      .then(() => {
        this.opts.onLog("[local-agent] 重启后健康探测就绪");
        this.restartCount = 0;
      })
      .catch((e: unknown) => {
        this.opts.onLog(
          `[local-agent] 重启后健康探测失败: ${(e as Error)?.message}`,
        );
      });
  }

  private killChild(): void {
    const child = this.child;
    if (!child || child.killed) return;
    try {
      // local-agent 监听 SIGTERM/SIGINT → process.exit(0)；Windows 上为强制终止。
      child.kill();
    } catch {
      /* ignore */
    }
  }

  /** 轮询 /local/health 直到 ok 或超时。 */
  private waitHealthy(timeoutMs: number): Promise<HealthBody> {
    const deadline = Date.now() + timeoutMs;
    const attempt = (): Promise<HealthBody> =>
      this.probeHealth().then((body) => {
        if (body && body.ok) return body;
        if (Date.now() >= deadline) {
          throw new Error("本地代理 health 未就绪（超时）");
        }
        return new Promise<HealthBody>((resolve) =>
          setTimeout(resolve, 300),
        ).then(attempt);
      });
    return attempt();
  }

  private probeHealth(): Promise<HealthBody | null> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: this.opts.port,
          path: "/local/health",
          timeout: 2000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            try {
              const body = JSON.parse(
                Buffer.concat(chunks).toString("utf-8"),
              ) as HealthBody;
              resolve(body);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    });
  }
}
