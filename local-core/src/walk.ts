import fs from "node:fs";
import path from "node:path";

export interface RelFile {
  rel: string;
  abs: string;
}

/**
 * Recursively collect regular files using the same semantics as Python
 * Path.rglob("*") + is_file(). Directory symlinks are not followed.
 */
export function walkFiles(root: string): RelFile[] {
  const out: RelFile[] = [];
  let rootStat: fs.Stats;
  try {
    rootStat = fs.statSync(root);
  } catch {
    return out;
  }
  if (!rootStat.isDirectory()) return out;

  const toPosixRel = (abs: string): string =>
    path.relative(root, abs).split(path.sep).join("/");

  const recurse = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        recurse(abs);
      } else if (entry.isFile()) {
        out.push({ rel: toPosixRel(abs), abs });
      } else if (entry.isSymbolicLink()) {
        try {
          if (fs.statSync(abs).isFile()) out.push({ rel: toPosixRel(abs), abs });
        } catch {
          // Ignore broken or inaccessible symlinks.
        }
      }
    }
  };

  recurse(root);
  return out;
}
