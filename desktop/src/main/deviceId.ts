import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 设备身份本机侧（方案 B · M5-b 设备身份地基，设计 §3.1 / §3.3）。
 *
 * 收敛 M5-a 占位：原本机临时 uuid（旧字段 `deviceId`）升格为 **`clientUuid`**
 * （本机持久、与登录用户无关，仅作「同机同用户」幂等再注册键，非鉴权凭证）；
 * 登录后由渲染层调云端 `POST /devices/register` 取服务端铸造的规范 `device_id`，
 * 经桥回写本机 `registeredDeviceId`。
 *
 * 运行时注入的 `deviceId` 优先级 = `registeredDeviceId ?? clientUuid`
 * （未注册前用 clientUuid 占位，注册后即用规范 device_id）。
 */

interface DeviceFile {
  /** 本机持久 uuid（幂等再注册键）。 */
  clientUuid: string;
  /** 云端注册后回写的规范 device_id（服务端铸造）。未注册时缺省。 */
  registeredDeviceId?: string;
  note: string;
  createdAt: string;
  updatedAt?: string;
}

function deviceFile(): string {
  return path.join(app.getPath("userData"), "vibebara-device.json");
}

function readFileSafe(): Partial<DeviceFile> & { deviceId?: string } {
  try {
    const f = deviceFile();
    if (fs.existsSync(f)) {
      return JSON.parse(fs.readFileSync(f, "utf-8")) as Partial<DeviceFile> & {
        deviceId?: string;
      };
    }
  } catch {
    /* fallthrough */
  }
  return {};
}

function writeFileSafe(payload: DeviceFile): void {
  try {
    fs.writeFileSync(deviceFile(), JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn("[device-id] 持久化失败:", (e as Error)?.message);
  }
}

/**
 * 读取/生成本机 `clientUuid`（持久）。
 * 平滑迁移：旧文件（M5-a）只有 `deviceId` 字段时，将其视为 `clientUuid`（零数据丢失）。
 */
export function getOrCreateClientUuid(): string {
  const j = readFileSafe();
  // 已升级：直接用 clientUuid
  if (typeof j.clientUuid === "string" && j.clientUuid.trim()) {
    return j.clientUuid.trim();
  }
  // M5-a 旧文件：把旧 deviceId 平移为 clientUuid
  const legacy =
    typeof j.deviceId === "string" && j.deviceId.trim() ? j.deviceId.trim() : "";
  const clientUuid = legacy || crypto.randomUUID();
  writeFileSafe({
    clientUuid,
    registeredDeviceId:
      typeof j.registeredDeviceId === "string" ? j.registeredDeviceId : undefined,
    note:
      "M5-b 设备身份：clientUuid 为本机持久 uuid（幂等键，非鉴权凭证）；" +
      "registeredDeviceId 为云端 POST /devices/register 铸造的规范 device_id。",
    createdAt: typeof j.createdAt === "string" ? j.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return clientUuid;
}

/** 读取已回写的规范 device_id（未注册返回 undefined）。 */
export function getRegisteredDeviceId(): string | undefined {
  const j = readFileSafe();
  const id = j.registeredDeviceId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * 回写云端铸造的规范 device_id（登录注册后由桥触发）。
 * 保留 clientUuid 不变；幂等覆盖 registeredDeviceId。
 */
export function persistRegisteredDeviceId(deviceId: string): void {
  const id = (deviceId || "").trim();
  if (!id) return;
  const clientUuid = getOrCreateClientUuid();
  const j = readFileSafe();
  writeFileSafe({
    clientUuid,
    registeredDeviceId: id,
    note:
      "M5-b 设备身份：clientUuid 为本机持久 uuid（幂等键，非鉴权凭证）；" +
      "registeredDeviceId 为云端 POST /devices/register 铸造的规范 device_id。",
    createdAt: typeof j.createdAt === "string" ? j.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/** 运行时注入用的有效 deviceId：优先注册后的规范 id，否则本机 clientUuid 占位。 */
export function getEffectiveDeviceId(): string {
  return getRegisteredDeviceId() ?? getOrCreateClientUuid();
}
