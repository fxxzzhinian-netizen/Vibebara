import fs from "node:fs";
import path from "node:path";

export function normalizeAbs(value: string): string {
  return path.resolve(value);
}

export function realResolve(value: string): string {
  const abs = normalizeAbs(value);
  let current = abs;
  const tail: string[] = [];
  while (true) {
    if (fs.existsSync(current)) {
      let real = current;
      try {
        real = fs.realpathSync.native(current);
      } catch {
        // Fall back to the normalized path.
      }
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    }
    const parent = path.dirname(current);
    if (parent === current) return abs;
    tail.push(path.basename(current));
    current = parent;
  }
}

function caseKey(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function isInside(child: string, parent: string): boolean {
  const normalizedChild = caseKey(normalizeAbs(child));
  const normalizedParent = caseKey(normalizeAbs(parent));
  if (normalizedChild === normalizedParent) return true;
  const relative = path.relative(normalizedParent, normalizedChild);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

export class WritableRoots {
  private readonly roots = new Set<string>();

  constructor(initial: string[] = []) {
    for (const root of initial) this.register(root);
  }

  register(dir: string): void {
    if (dir?.trim()) this.roots.add(caseKey(realResolve(dir)));
  }

  list(): string[] {
    return [...this.roots];
  }

  isAllowed(targetAbs: string): boolean {
    const target = realResolve(targetAbs);
    return [...this.roots].some((root) => isInside(target, root));
  }
}

export function safeJoinUnder(installPath: string, relPosix: string): string {
  if (!relPosix || typeof relPosix !== "string") {
    throw new Error("空相对路径");
  }
  const segments = relPosix.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`相对路径含 '..'：${relPosix}`);
  }
  if (path.isAbsolute(relPosix) || /^[a-zA-Z]:/.test(relPosix)) {
    throw new Error(`相对路径不可为绝对路径：${relPosix}`);
  }
  const joined = path.join(installPath, ...segments);
  if (!isInside(joined, installPath)) {
    throw new Error(`写入路径逃逸 install 根：${relPosix}`);
  }
  return joined;
}
