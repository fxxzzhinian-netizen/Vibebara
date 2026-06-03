import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeDirHash } from "../src/hash";
import { WatchSession } from "../src/handlers/watch";
import type { WatchServerMessage } from "../src/types";

/**
 * WS /local/watch 会话测试 —— 验证 subscribe 首推、dirty 判定、ping/pong、文件变更检测。
 */

let tmp: string;
let install: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "la-watch-")));
  install = path.join(tmp, "skill");
  fs.mkdirSync(install, { recursive: true });
  fs.writeFileSync(path.join(install, "SKILL.md"), "v1");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("WatchSession", () => {
  it("subscribe 首推当前状态 + subscribed ack；installedHash 匹配 → unchanged/dirty:false", () => {
    const msgs: WatchServerMessage[] = [];
    const session = new WatchSession((m) => msgs.push(m));
    const installedHash = computeDirHash(install);

    session.handleMessage(
      JSON.stringify({
        op: "subscribe",
        deployments: [{ deploymentId: "d1", installPath: install, installedHash }],
      }),
    );

    const event = msgs.find((m) => "deploymentId" in m && m.deploymentId === "d1");
    expect(event).toBeDefined();
    expect((event as any).type).toBe("unchanged");
    expect((event as any).dirty).toBe(false);
    expect((event as any).exists).toBe(true);
    expect(msgs.some((m) => m.type === "subscribed")).toBe(true);

    session.close();
  });

  it("installedHash 不匹配 → changed/dirty:true", () => {
    const msgs: WatchServerMessage[] = [];
    const session = new WatchSession((m) => msgs.push(m));
    session.handleMessage(
      JSON.stringify({
        op: "subscribe",
        deployments: [
          { deploymentId: "d2", installPath: install, installedHash: "stale-hash" },
        ],
      }),
    );
    const event = msgs.find((m) => "deploymentId" in m) as any;
    expect(event.type).toBe("changed");
    expect(event.dirty).toBe(true);
    session.close();
  });

  it("installPath 不存在 → missing", () => {
    const msgs: WatchServerMessage[] = [];
    const session = new WatchSession((m) => msgs.push(m));
    session.handleMessage(
      JSON.stringify({
        op: "subscribe",
        deployments: [
          {
            deploymentId: "d3",
            installPath: path.join(tmp, "nope"),
            installedHash: "x",
          },
        ],
      }),
    );
    const event = msgs.find((m) => "deploymentId" in m) as any;
    expect(event.type).toBe("missing");
    expect(event.exists).toBe(false);
    session.close();
  });

  it("ping → pong", () => {
    const msgs: WatchServerMessage[] = [];
    const session = new WatchSession((m) => msgs.push(m));
    session.handleMessage(JSON.stringify({ op: "ping" }));
    expect(msgs.some((m) => m.type === "pong")).toBe(true);
    session.close();
  });

  it("文件变更后（防抖）推送 changed 事件", async () => {
    const msgs: WatchServerMessage[] = [];
    const session = new WatchSession((m) => msgs.push(m));
    const installedHash = computeDirHash(install);
    session.handleMessage(
      JSON.stringify({
        op: "subscribe",
        deployments: [{ deploymentId: "d4", installPath: install, installedHash }],
      }),
    );
    const initialCount = msgs.length;

    // 修改文件内容 → 触发 watch（防抖 1s）或安全轮询（3s）
    fs.writeFileSync(path.join(install, "SKILL.md"), "v2-changed-content");
    await sleep(3500);

    const changed = msgs
      .slice(initialCount)
      .find((m) => "deploymentId" in m && (m as any).type === "changed");
    expect(changed).toBeDefined();
    expect((changed as any).dirty).toBe(true);
    session.close();
  }, 10000);
});
