import net from "node:net";

/**
 * 探测一个可用端口（仅 127.0.0.1）。
 *
 * 优先尝试 `preferred`（与 local-agent dev 默认 51873 对齐，便于诊断）；
 * 被占用则回退到操作系统分配的临时端口（listen 0）。
 *
 * 注意：本函数关闭监听后返回端口，存在极小竞态窗口（返回到 local-agent 真正
 * bind 之间可能被他人抢占）。local-agent 自身在 EADDRINUSE 时会顺延端口，
 * 双保险；M5-a 以探测值为准并在文档登记该限制。
 */
export function findFreePort(preferred?: number): Promise<number> {
  const tryListen = (port: number): Promise<number | null> =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => {
        srv.close(() => resolve(null));
      });
      srv.listen(port, "127.0.0.1", () => {
        const addr = srv.address();
        const actual = typeof addr === "object" && addr ? addr.port : port;
        srv.close(() => resolve(actual));
      });
    });

  return (async () => {
    if (preferred && preferred > 0) {
      const got = await tryListen(preferred);
      if (got) return got;
    }
    const ephemeral = await tryListen(0);
    if (ephemeral) return ephemeral;
    throw new Error("无法分配可用端口");
  })();
}
