import { getDesktopBackendPort, isDesktopRuntime, setDesktopBackendPort } from './desktopBridge';

export interface DesktopSidecarConfig {
  backendBin: string | null;
  port: number;
}

export async function getDesktopSidecarConfig(): Promise<DesktopSidecarConfig> {
  if (!isDesktopRuntime()) {
    return {
      backendBin: null,
      port: getDesktopBackendPort(),
    };
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const config = await invoke<DesktopSidecarConfig>('get_sidecar_config');
  setDesktopBackendPort(config.port);
  return config;
}

export async function saveDesktopSidecarConfig(config: DesktopSidecarConfig): Promise<void> {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop sidecar settings are only available in Tauri runtime.');
  }

  const normalizedPort = Number.isFinite(config.port) && config.port > 0 ? Math.floor(config.port) : 8091;
  const normalizedConfig: DesktopSidecarConfig = {
    backendBin: config.backendBin && config.backendBin.trim() ? config.backendBin.trim() : null,
    port: normalizedPort,
  };

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_sidecar_config', {
    config: normalizedConfig,
  });
  setDesktopBackendPort(normalizedPort);
}

export async function restartDesktopSidecar(): Promise<void> {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop sidecar restart is only available in Tauri runtime.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('restart_sidecar');
}
