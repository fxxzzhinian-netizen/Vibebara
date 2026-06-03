import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "dist", "index.js");

console.error(`[bridge] __dirname = ${__dirname}`);
console.error(`[bridge] dist path = ${distPath}`);
console.error(`[bridge] dist exists = ${existsSync(distPath)}`);

let loadAndValidate, buildSkill, initSkill, scanAndPackage, migrateSkill;
try {
  const mod = await import(pathToFileURL(distPath));
  loadAndValidate = mod.loadAndValidate;
  buildSkill = mod.buildSkill;
  initSkill = mod.initSkill;
  scanAndPackage = mod.scanAndPackage;
  migrateSkill = mod.migrateSkill;
  console.error("[bridge] dist/index.js 加载成功");
} catch (err) {
  console.error(`[bridge] 加载 dist/index.js 失败: ${err.message}`);
  process.stdout.write(
    JSON.stringify({ success: false, error: `加载失败: ${err.message}` })
  );
  process.exit(1);
}

function readStdin() {
  return readFileSync(0, "utf-8");
}

function respond(data) {
  process.stdout.write(JSON.stringify(data));
}

function respondError(message) {
  respond({ success: false, error: message });
}

function createTempDir() {
  const dir = join(tmpdir(), `skill-forge-bridge-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
}

function collectFiles(dir, base = "") {
  const results = {};
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = base ? `${base}/${entry}` : entry;
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        Object.assign(results, collectFiles(fullPath, relPath));
      } else {
        results[relPath] = readFileSync(fullPath, "utf-8");
      }
    }
  } catch {
    // 目录不存在
  }
  return results;
}

async function handleValidate(payload) {
  const { yaml: yamlContent } = payload;
  if (!yamlContent) return respondError("缺少 yaml 字段");

  const tempDir = createTempDir();
  const configPath = join(tempDir, "skill.config.yaml");
  try {
    writeFileSync(configPath, yamlContent, "utf-8");
    const result = await loadAndValidate(configPath);
    respond({ success: true, data: result });
  } catch (err) {
    respondError(err.message);
  } finally {
    cleanupDir(tempDir);
  }
}

async function handleBuild(payload) {
  const { yaml: yamlContent, target = "all" } = payload;
  if (!yamlContent) return respondError("缺少 yaml 字段");

  const tempDir = createTempDir();
  const configPath = join(tempDir, "skill.config.yaml");
  const outputDir = join(tempDir, "output");
  try {
    writeFileSync(configPath, yamlContent, "utf-8");
    mkdirSync(outputDir, { recursive: true });

    const origCwd = process.cwd();
    process.chdir(tempDir);
    const results = await buildSkill({ target, configPath, outputDir });
    process.chdir(origCwd);

    const buildOutputs = results.map((r) => ({
      target: r.target,
      files: r.files,
      outputDir: r.outputDir,
      contents: collectFiles(r.outputDir),
    }));
    respond({ success: true, data: buildOutputs });
  } catch (err) {
    respondError(err.message);
  } finally {
    cleanupDir(tempDir);
  }
}

async function handlePreview(payload) {
  const { yaml: yamlContent, target = "all" } = payload;
  if (!yamlContent) return respondError("缺少 yaml 字段");

  const tempDir = createTempDir();
  const configPath = join(tempDir, "skill.config.yaml");
  const outputDir = join(tempDir, "output");
  try {
    writeFileSync(configPath, yamlContent, "utf-8");
    mkdirSync(outputDir, { recursive: true });

    const origCwd = process.cwd();
    process.chdir(tempDir);
    const results = await buildSkill({ target, configPath, outputDir });
    process.chdir(origCwd);

    const previews = results.map((r) => ({
      target: r.target,
      contents: collectFiles(r.outputDir),
    }));
    respond({ success: true, data: previews });
  } catch (err) {
    respondError(err.message);
  } finally {
    cleanupDir(tempDir);
  }
}

async function handleInit(payload) {
  const { name } = payload;
  if (!name) return respondError("缺少 name 字段");

  const tempDir = createTempDir();
  try {
    const result = await initSkill({ name, outputDir: join(tempDir, name) });
    const contents = collectFiles(result.dir);
    respond({ success: true, data: { name: result.name, contents } });
  } catch (err) {
    respondError(err.message);
  } finally {
    cleanupDir(tempDir);
  }
}

async function handleScanAndPackage(payload) {
  const { rootDir } = payload;
  if (!rootDir) return respondError("缺少 rootDir 字段");

  try {
    const packages = await scanAndPackage(rootDir);
    respond({ success: true, data: packages });
  } catch (err) {
    respondError(err.message);
  }
}

async function handleMigrate(payload) {
  const { sourcePath, targetPlatform, outputDir } = payload;
  if (!sourcePath) return respondError("缺少 sourcePath 字段");
  if (!targetPlatform) return respondError("缺少 targetPlatform 字段");

  try {
    const result = await migrateSkill({
      sourcePath,
      targetPlatform,
      outputDir: outputDir || undefined,
    });
    respond({ success: true, data: result });
  } catch (err) {
    respondError(err.message);
  }
}

async function main() {
  try {
    console.error("[bridge] 读取 stdin...");
    const input = readStdin();
    console.error(`[bridge] 收到输入 (${input.length} bytes), action=${JSON.parse(input).action}`);
    const { action, payload } = JSON.parse(input);

    switch (action) {
      case "validate":
        await handleValidate(payload);
        break;
      case "build":
        await handleBuild(payload);
        break;
      case "preview":
        await handlePreview(payload);
        break;
      case "init":
        await handleInit(payload);
        break;
      case "scan-and-package":
        await handleScanAndPackage(payload);
        break;
      case "migrate":
        await handleMigrate(payload);
        break;
      default:
        respondError(`未知操作: ${action}`);
    }
    console.error(`[bridge] 操作 "${action}" 完成`);
  } catch (err) {
    console.error(`[bridge] 错误: ${err.message}`);
    respondError(`Bridge 错误: ${err.message}`);
  } finally {
    process.exit(0);
  }
}

main();
