import { createHash } from "node:crypto";
import fs from "node:fs";
import { walkFiles } from "./walk";

/**
 * Frozen directory hash shared with backend _compute_content_hash:
 * UTF-8 byte-sorted relative POSIX path + NUL + raw bytes + NUL.
 */
export function computeDirHash(rootAbsPath: string): string {
  if (!fs.existsSync(rootAbsPath)) return "";
  const files = walkFiles(rootAbsPath);
  if (files.length === 0) return "";

  files.sort((a, b) =>
    Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")),
  );
  const digest = createHash("sha256");
  const nul = Buffer.from([0]);
  for (const file of files) {
    digest.update(Buffer.from(file.rel, "utf8"));
    digest.update(nul);
    digest.update(fs.readFileSync(file.abs));
    digest.update(nul);
  }
  return digest.digest("hex");
}

export function hashPath(absPath: string): { hash: string; exists: boolean } {
  const exists = fs.existsSync(absPath);
  return { hash: computeDirHash(absPath), exists };
}
