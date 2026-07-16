import fs from "node:fs";
import path from "node:path";
import type { ContentEncoding, FilePayload } from "./types";

export function isBinary(buf: Buffer): boolean {
  if (buf.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
    return false;
  } catch {
    return true;
  }
}

export function readFilePayload(absPath: string, relPosix: string): FilePayload {
  const buf = fs.readFileSync(absPath);
  if (isBinary(buf)) {
    return { path: relPosix, encoding: "base64", content: buf.toString("base64") };
  }
  return { path: relPosix, encoding: "utf8", content: buf.toString("utf8") };
}

export function writeContent(
  absPath: string,
  encoding: ContentEncoding,
  content: string,
): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const data =
    encoding === "base64"
      ? Buffer.from(content, "base64")
      : Buffer.from(content, "utf8");
  fs.writeFileSync(absPath, data);
}
