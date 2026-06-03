import fs from "node:fs";
import { computeDirHash } from "../hash";
import type {
  WatchClientMessage,
  WatchEventType,
  WatchServerEvent,
  WatchServerMessage,
  WatchSubscription,
} from "../types";

/**
 * WS /local/watch 会话 —— 替代后端 file_watcher_service 的部署轮询
 * （_deployment_poll_loop，:188-213）。
 *
 * 每个 WS 连接一个 WatchSession：订阅 installPath，文件事件（防抖）触发即本地
 * 重算 hash 与 installedHash 比对，按 dirty 推送 WatchServerEvent。
 *   · DEBOUNCE_MS≈1000、安全轮询 POLL_MS≈3000（对齐现状 debounce=1000 / 3s 轮询）。
 *   · 仅在「计算状态相对上次推送发生变化」时推送，避免噪声（含初次订阅的首推）。
 */

const DEBOUNCE_MS = 1000;
const POLL_MS = 3000;

interface Tracked {
  sub: WatchSubscription;
  watcher?: fs.FSWatcher;
  debounce?: NodeJS.Timeout;
  poll?: NodeJS.Timeout;
  last?: { hash: string; exists: boolean };
}

export class WatchSession {
  private readonly tracked = new Map<string, Tracked>();
  private closed = false;

  constructor(private readonly send: (msg: WatchServerMessage) => void) {}

  handleMessage(raw: string): void {
    let msg: WatchClientMessage;
    try {
      msg = JSON.parse(raw) as WatchClientMessage;
    } catch {
      return; // 非法 JSON 忽略
    }
    if (!msg || typeof msg !== "object") return;
    switch (msg.op) {
      case "subscribe":
        this.subscribe(Array.isArray(msg.deployments) ? msg.deployments : []);
        break;
      case "unsubscribe":
        this.unsubscribe(
          Array.isArray(msg.deploymentIds) ? msg.deploymentIds : [],
        );
        break;
      case "ping":
        this.send({ type: "pong" });
        break;
      default:
        break;
    }
  }

  private subscribe(subs: WatchSubscription[]): void {
    const ids: string[] = [];
    for (const sub of subs) {
      if (!sub || !sub.deploymentId || !sub.installPath) continue;
      this.teardownOne(sub.deploymentId); // 替换旧订阅
      const t: Tracked = { sub };
      this.tracked.set(sub.deploymentId, t);
      ids.push(sub.deploymentId);
      this.setupWatcher(t);
      // 首推当前状态（force）
      this.emit(t, true);
      // 安全轮询，兜底捕获 missing→exists 等遗漏事件
      t.poll = setInterval(() => this.emit(t, false), POLL_MS);
    }
    this.send({ type: "subscribed", deploymentIds: ids });
  }

  private unsubscribe(ids: string[]): void {
    for (const id of ids) {
      this.teardownOne(id);
    }
  }

  private setupWatcher(t: Tracked): void {
    try {
      t.watcher = fs.watch(
        t.sub.installPath,
        { recursive: true },
        () => this.scheduleDebounce(t),
      );
      t.watcher.on("error", () => {
        // 路径被删除等：关闭 watcher，交由轮询继续探测
        try {
          t.watcher?.close();
        } catch {
          /* ignore */
        }
        t.watcher = undefined;
      });
    } catch {
      // installPath 暂不存在 / 平台不支持 recursive：交由安全轮询兜底
      t.watcher = undefined;
    }
  }

  private scheduleDebounce(t: Tracked): void {
    if (t.debounce) clearTimeout(t.debounce);
    t.debounce = setTimeout(() => this.emit(t, false), DEBOUNCE_MS);
  }

  /** 计算当前状态并在「相对上次推送有变化」或 force 时推送。 */
  private emit(t: Tracked, force: boolean): void {
    if (this.closed) return;
    let event: WatchServerEvent;
    try {
      const exists = fs.existsSync(t.sub.installPath);
      const currentHash = computeDirHash(t.sub.installPath);
      const dirty = exists && currentHash !== t.sub.installedHash;
      let type: WatchEventType;
      if (!exists) type = "missing";
      else if (dirty) type = "changed";
      else type = "unchanged";

      if (
        !force &&
        t.last &&
        t.last.hash === currentHash &&
        t.last.exists === exists
      ) {
        return; // 状态未变，不重复推送
      }
      t.last = { hash: currentHash, exists };

      // watcher 之前因路径缺失未建立、现在出现了 → 补建 watcher
      if (exists && !t.watcher) {
        this.setupWatcher(t);
      }

      event = {
        type,
        deploymentId: t.sub.deploymentId,
        installPath: t.sub.installPath,
        currentHash,
        dirty,
        exists,
        ts: new Date().toISOString(),
      };
    } catch (err) {
      event = {
        type: "error",
        deploymentId: t.sub.deploymentId,
        installPath: t.sub.installPath,
        currentHash: "",
        dirty: false,
        exists: false,
        ts: new Date().toISOString(),
        error: (err as Error).message,
      };
    }
    this.send(event);
  }

  private teardownOne(id: string): void {
    const t = this.tracked.get(id);
    if (!t) return;
    if (t.debounce) clearTimeout(t.debounce);
    if (t.poll) clearInterval(t.poll);
    try {
      t.watcher?.close();
    } catch {
      /* ignore */
    }
    this.tracked.delete(id);
  }

  close(): void {
    this.closed = true;
    for (const id of [...this.tracked.keys()]) {
      this.teardownOne(id);
    }
  }
}
