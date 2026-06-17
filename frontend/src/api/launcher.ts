import apiClient from './client'
import { getDesktopBridge } from '@/runtime/desktopBridge'

export type ToolId =
  | 'cursor'
  | 'codex-cli'
  | 'codex-app'
  | 'windsurf'
  | 'claude-code'
  | 'claude-app'
  | 'kiro'
  | 'trae'
  | 'qoder'
  | 'workbuddy'

export interface LaunchRequest {
  tool: ToolId
  project_path?: string
}

export interface LaunchResponse {
  status: string
  tool: string
  mode: 'app' | 'terminal'
  message: string
}

export interface ToolInfo {
  id: ToolId
  label: string
  available: boolean
  mode: 'app' | 'terminal'
  description: string
}

export interface ToolsResponse {
  tools: ToolInfo[]
}

/**
 * 启动工具：
 *   · 桌面形态（决策 D）→ 经 __VIBEBARA_DESKTOP__ 桥调用主进程 IPC（cloud 已下线 /launcher 路由）；
 *   · web 形态 → 沿用云端 /launcher/launch（local 模式后端仍挂载该路由）。
 */
export async function launchTool(req: LaunchRequest): Promise<LaunchResponse> {
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.launcher.launchTool({ tool: req.tool, project_path: req.project_path })
  }
  const { data } = await apiClient.post('/launcher/launch', req)
  return data
}

export async function listTools(): Promise<ToolInfo[]> {
  const bridge = getDesktopBridge()
  if (bridge) {
    const res = await bridge.launcher.listTools()
    return res.tools
  }
  const { data } = await apiClient.get<ToolsResponse>('/launcher/tools')
  return data.tools
}
