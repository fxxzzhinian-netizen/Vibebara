import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC, type LauncherLaunchRequest, type RuntimeConfigPayload } from "../shared/types";
import * as launcher from "./launcher";
import * as tokenStore from "./tokenStore";

/**
 * 注册主进程 IPC 处理器（方案 B M5-a）。
 *
 *   · 同步：运行时配置、token 读取（preload sendSync，窗口加载前/拦截器同步取值）；
 *   · 异步：token 写/清、launcher 列举/启动（ipcRenderer.invoke）。
 */
export function registerIpc(deps: {
  getRuntimeConfig: () => RuntimeConfigPayload | null;
  /** 回写云端铸造的规范 device_id（M5-b 注册后）；返回回写后的有效 deviceId。 */
  persistDeviceId: (deviceId: string) => string;
}): void {
  // —— 运行时配置（同步）——
  ipcMain.on(IPC.RUNTIME_GET_SYNC, (event) => {
    event.returnValue = deps.getRuntimeConfig();
  });

  // —— 设备身份回写（M5-b，异步）：登录注册后把规范 device_id 落 vibebara-device.json ——
  ipcMain.handle(IPC.DEVICE_PERSIST_ID, (_e: IpcMainInvokeEvent, deviceId: unknown) => {
    const id = typeof deviceId === "string" ? deviceId : "";
    return deps.persistDeviceId(id);
  });

  // —— 登录 token（同步读 / 异步写）——
  ipcMain.on(IPC.TOKEN_GET_SYNC, (event) => {
    event.returnValue = tokenStore.getToken();
  });
  ipcMain.handle(IPC.TOKEN_SET, (_e: IpcMainInvokeEvent, token: unknown) => {
    tokenStore.setToken(typeof token === "string" ? token : "");
    return true;
  });
  ipcMain.handle(IPC.TOKEN_CLEAR, () => {
    tokenStore.clearToken();
    return true;
  });

  // —— launcher 一键启动（异步）——
  ipcMain.handle(IPC.LAUNCHER_LIST, () => {
    return launcher.listTools();
  });
  ipcMain.handle(
    IPC.LAUNCHER_LAUNCH,
    (_e: IpcMainInvokeEvent, req: LauncherLaunchRequest) => {
      try {
        return launcher.launchTool(req);
      } catch (e) {
        // 与后端 launcher 的 HTTPException 语义对齐：抛错，渲染层 catch 处理。
        throw new Error((e as Error)?.message ?? "启动失败");
      }
    },
  );
}
