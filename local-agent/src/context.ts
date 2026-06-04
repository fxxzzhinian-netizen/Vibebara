import type { AgentConfig } from "./config";
import { cursorSkillsDir, codexSkillsDir, windsurfSkillsDir } from "./platform";
import { WritableRoots } from "./security";

/**
 * 进程级运行上下文：配置 + 可写根白名单。handler 显式接收 ctx（而非读全局），
 * 便于单测注入与隔离。
 */
export interface AgentContext {
  config: AgentConfig;
  writableRoots: WritableRoots;
}

export function createContext(config: AgentConfig): AgentContext {
  // 可写根 = 启动注入根 ∪ 平台 skill 目录（scope=platform 始终可写）。
  // 【M5-b 任务③】运行期登记不再来自 browse（已去登记副作用），而是 write-skill 时
  // 绑定「用户确认选定的 deployPath 根」（见 handlers/writeSkill.ts）。
  const writableRoots = new WritableRoots([
    ...config.writableRoots,
    cursorSkillsDir(),
    codexSkillsDir(),
    windsurfSkillsDir(),
  ]);
  return { config, writableRoots };
}
