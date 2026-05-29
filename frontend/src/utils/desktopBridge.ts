type WindowWithTauri = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
};

const DESKTOP_PORT_STORAGE_KEY = "pertisk-desktop-backend-port";
const DEFAULT_DESKTOP_PORT = 15222;
const INITIAL_PORT_REFRESH_WAIT_MS = 1200;

let desktopBackendOrigin = buildBackendOrigin(readPersistedPort());
let initialPortRefreshReady: Promise<void> | null = null;

function readPersistedPort(): number {
  try {
    const raw = window.localStorage.getItem(DESKTOP_PORT_STORAGE_KEY);
    if (!raw) return DEFAULT_DESKTOP_PORT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DESKTOP_PORT;
  } catch {
    return DEFAULT_DESKTOP_PORT;
  }
}

function buildBackendOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function getDesktopBackendOrigin(): string {
  return desktopBackendOrigin;
}

export function getDesktopWebSocketBase(): string {
  const backend = new URL(desktopBackendOrigin);
  const protocol = backend.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${backend.host}`;
}

export function getDesktopBackendPort(): number {
  const parsed = new URL(desktopBackendOrigin).port;
  const port = Number.parseInt(parsed, 10);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_DESKTOP_PORT;
}

export function setDesktopBackendPort(port: number): void {
  const validPort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_DESKTOP_PORT;
  desktopBackendOrigin = buildBackendOrigin(validPort);
  try {
    window.localStorage.setItem(DESKTOP_PORT_STORAGE_KEY, String(validPort));
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

export async function refreshDesktopBackendPortFromSidecar(): Promise<boolean> {
  if (!isDesktopRuntime()) {
    return false;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cfg = await invoke<{ port?: number }>('get_sidecar_config');
    if (cfg && typeof cfg.port === 'number' && Number.isFinite(cfg.port) && cfg.port > 0) {
      setDesktopBackendPort(cfg.port);
      return true;
    }
  } catch {
    // Ignore lookup failures; caller can continue with persisted/default port.
  }

  return false;
}

export function isDesktopRuntime(): boolean {
  const w = window as WindowWithTauri;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return (
    Boolean(w.__TAURI_INTERNALS__) ||
    Boolean(w.__TAURI__) ||
    userAgent.includes('Tauri') ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
}

function rewriteHttpUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl, window.location.origin);
  if (parsed.pathname.startsWith("/api")) {
    return `${desktopBackendOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return rawUrl;
}

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isDesktopApiRequest(input: RequestInfo | URL): boolean {
  const parsed = new URL(requestUrlString(input), window.location.origin);
  return parsed.pathname.startsWith('/api');
}

function ensureInitialDesktopPortRefreshStarted(): Promise<void> {
  if (initialPortRefreshReady) {
    return initialPortRefreshReady;
  }

  const refreshPromise = refreshDesktopBackendPortFromSidecar()
    .then(() => undefined)
    .catch(() => undefined);
  const timeoutPromise = new Promise<void>((resolve) => {
    window.setTimeout(resolve, INITIAL_PORT_REFRESH_WAIT_MS);
  });

  initialPortRefreshReady = Promise.race([refreshPromise, timeoutPromise]);
  return initialPortRefreshReady;
}

function isRetriableDesktopApiRequest(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS';
}

function isNetworkFailure(error: unknown): boolean {
  // fetch() throws TypeError on connection failures in browsers/WebView runtimes.
  return error instanceof TypeError;
}

function rewriteWsUrl(rawUrl: string): string {
  const normalized = rawUrl.startsWith("ws://") || rawUrl.startsWith("wss://")
    ? rawUrl
    : new URL(rawUrl, window.location.origin).toString();

  const parsed = new URL(normalized);
  const isApiSocket = parsed.pathname === "/ws" || parsed.pathname.startsWith("/api/");

  if (!isApiSocket) {
    return rawUrl;
  }

  const backendWs = new URL(desktopBackendOrigin);
  parsed.protocol = backendWs.protocol === "https:" ? "wss:" : "ws:";
  parsed.hostname = backendWs.hostname;
  parsed.port = backendWs.port;
  return parsed.toString();
}

export function installDesktopBridge(): void {
  if (!isDesktopRuntime()) {
    return;
  }

  // Refresh from native sidecar config early so stale persisted ports don't keep
  // WebSocket/API calls pointed at an old backend instance.
  void ensureInitialDesktopPortRefreshStarted();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isApiRequest = isDesktopApiRequest(input);
    if (isApiRequest) {
      await ensureInitialDesktopPortRefreshStarted();
    }

    const inputMethod = input instanceof Request ? input.method : undefined;
    const method = (init?.method ?? inputMethod ?? 'GET').toUpperCase();

    const buildTarget = (): RequestInfo | URL => {
      if (typeof input === 'string') {
        return rewriteHttpUrl(input);
      }

      if (input instanceof URL) {
        return new URL(rewriteHttpUrl(input.toString()));
      }

      const rewrittenUrl = rewriteHttpUrl(input.url);
      if (rewrittenUrl === input.url) {
        return input;
      }

      return new Request(rewrittenUrl, input);
    };

    const firstTarget = buildTarget();

    try {
      return await nativeFetch(firstTarget, init);
    } catch (error) {
      const shouldRetry = isRetriableDesktopApiRequest(method)
        && isNetworkFailure(error)
        && isApiRequest;

      if (!shouldRetry) {
        throw error;
      }

      const refreshed = await refreshDesktopBackendPortFromSidecar();
      if (!refreshed) {
        throw error;
      }

      const retryTarget = buildTarget();
      return nativeFetch(retryTarget, init);
    }
  };

  const NativeWebSocket = window.WebSocket;
  class DesktopWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const rewritten = rewriteWsUrl(String(url));
      super(rewritten, protocols as string | string[] | undefined);
    }
  }

  window.WebSocket = DesktopWebSocket as typeof WebSocket;
}
