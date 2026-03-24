import { getDesktopBackendPort, isDesktopRuntime, setDesktopBackendPort } from './desktopBridge';

export interface DesktopSidecarConfig {
  backendBin: string | null;
  kubeconfigPath: string | null;
  kubeContext: string | null;
  port: number;
}

export interface DesktopKubeconfigCluster {
  context: string;
  cluster: string | null;
  namespace: string | null;
  isCurrent: boolean;
  kubeconfigPath: string;
}

export interface DesktopClusterSwitchResult {
  success: boolean;
  message?: string | null;
}

interface DesktopClusterSwitchStatus {
  inProgress: boolean;
  lastSuccess: boolean | null;
  message?: string | null;
  requestedContext?: string | null;
}

export async function getDesktopSidecarConfig(): Promise<DesktopSidecarConfig> {
  if (!isDesktopRuntime()) {
    return {
      backendBin: null,
      kubeconfigPath: null,
      kubeContext: null,
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
    kubeconfigPath: config.kubeconfigPath && config.kubeconfigPath.trim() ? config.kubeconfigPath.trim() : null,
    kubeContext: config.kubeContext && config.kubeContext.trim() ? config.kubeContext.trim() : null,
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

export async function listDesktopKubeconfigCandidates(): Promise<string[]> {
  if (!isDesktopRuntime()) {
    return [];
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const candidates = await invoke<string[]>('list_kubeconfig_candidates');
  return candidates;
}

export async function listDesktopKubeconfigClusters(kubeconfigPath?: string | null): Promise<DesktopKubeconfigCluster[]> {
  if (!isDesktopRuntime()) {
    return [];
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const clusters = await invoke<DesktopKubeconfigCluster[]>('list_kubeconfig_clusters', {
    kubeconfigPath: kubeconfigPath ?? null,
  });
  return clusters;
}

export async function waitDesktopClusterSwitchResult(
  expectedContext: string,
  timeoutMs: number = 25_000
): Promise<DesktopClusterSwitchResult> {
  if (!isDesktopRuntime()) {
    return { success: true };
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const startedAt = Date.now();
  const normalizedExpected = expectedContext.trim();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await invoke<DesktopClusterSwitchStatus>('get_cluster_switch_status');

    if (status.inProgress) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      continue;
    }

    if (status.lastSuccess === true) {
      const requested = (status.requestedContext || '').trim();
      if (!normalizedExpected || !requested || requested === normalizedExpected) {
        return { success: true };
      }
    }

    if (status.lastSuccess === false) {
      return {
        success: false,
        message: status.message || 'Cluster switch failed and previous cluster was restored.',
      };
    }

    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }

  return {
    success: false,
    message: 'Timed out while waiting for cluster switch. Previous cluster may still be active.',
  };
}
