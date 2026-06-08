import os from "node:os";
import { AGENT_VERSION, API_VERSION } from "../constants";
import type { AgentContext } from "../context";
import { cursorSkillsDir, codexSkillsDir, windsurfSkillsDir, claudeSkillsDir, kiroSkillsDir, traeSkillsDir, qoderSkillsDir } from "../platform";
import type { HealthResponse } from "../types";

/** GET /local/health —— 唯一免配对令牌端点（配对前探测端口存活）。 */
export function handleHealth(ctx: AgentContext): HealthResponse {
  return {
    ok: true,
    apiVersion: API_VERSION,
    agentVersion: AGENT_VERSION,
    platform: os.platform(),
    paired: ctx.config.paired,
    platformSkillDirs: {
      cursor: cursorSkillsDir(),
      codex: codexSkillsDir(),
      windsurf: windsurfSkillsDir(),
      claude: claudeSkillsDir(),
      kiro: kiroSkillsDir(),
      trae: traeSkillsDir(),
      qoder: qoderSkillsDir(),
    },
  };
}
