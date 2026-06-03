import fs from "node:fs";
import path from "node:path";
import type { ContentEncoding, FilePayload } from "./types";

/**
 * 文件内容编码工具 —— 实现契约 §4.5「文本 utf8 原样 / 二进制 base64」。
 * 落盘忠实性要求：逐字节忠实，不改写换行/编码，以保证 hash 一致与 §7.4 预测成立。
 */

/**
 * 判定 Buffer 是否应按二进制处理：
 *  · 含 NUL 字节 → 二进制；
 *  · 非法 UTF-8（无法严格解码）→ 二进制；
 *  · 否则视为 UTF-8 文本。
 */
export function isBinary(buf: Buffer): boolean {
  if (buf.includes(0)) return true;
  try {
    // fatal 模式：遇非法字节抛错
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
    return false;
  } catch {
    return true;
  }
}

/** 读取单文件 → FilePayload（文本 utf8 原样，二进制 base64）。 */
export function readFilePayload(absPath: string, relPosix: string): FilePayload {
  const buf = fs.readFileSync(absPath);
  if (isBinary(buf)) {
    return { path: relPosix, encoding: "base64", content: buf.toString("base64") };
  }
  return { path: relPosix, encoding: "utf8", content: buf.toString("utf8") };
}

/** 把一段内容按指定编码忠实落盘（不做 CRLF/LF 归一）。 */
export function writeContent(
  absPath: string,
  encoding: ContentEncoding,
  content: string,
): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (encoding === "base64") {
    fs.writeFileSync(absPath, Buffer.from(content, "base64"));
  } else {
    fs.writeFileSync(absPath, Buffer.from(content, "utf8"));
  }
}
