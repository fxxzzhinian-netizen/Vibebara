import fs from "node:fs";
import path from "node:path";

/** 相对（POSIX）+ 绝对路径对。 */
export interface RelFile {
  rel: string;
  abs: string;
}

/**
 * 递归收集 root 下所有"常规文件"，返回 {rel(posix), abs}。
 *
 * 语义对齐 Python `Path(root).rglob("*")` + `is_file()`（hash 与 read-folder 共用，
 * 杜绝口径漂移）：
 *   · 含隐藏文件（dotfiles）；
 *   · 排除目录本身；
 *   · symlink→file 计为文件；symlink→dir 不递归（不跟随目录软链，防环）；
 *   · root 不是目录（不存在/是文件）→ 返回 []。
 */
export function walkFiles(root: string): RelFile[] {
  const out: RelFile[] = [];
  let rootStat: fs.Stats;
  try {
    rootStat = fs.statSync(root);
  } catch {
    return out;
  }
  if (!rootStat.isDirectory()) {
    return out;
  }

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
        continue;
      }
      if (entry.isFile()) {
        out.push({ rel: toPosixRel(abs), abs });
        continue;
      }
      if (entry.isSymbolicLink()) {
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        if (st.isFile()) {
          out.push({ rel: toPosixRel(abs), abs });
        }
      }
    }
  };

  recurse(root);
  return out;
}
