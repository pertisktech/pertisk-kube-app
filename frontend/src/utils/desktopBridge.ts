type WindowWithTauri = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
};

const DESKTOP_PORT_STORAGE_KEY = "pertisk-desktop-backend-port";
const DEFAULT_DESKTOP_PORT = 15222;

let desktopBackendOrigin = buildBackendOrigin(readPersistedPort());

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
  void refreshDesktopBackendPortFromSidecar();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return nativeFetch(rewriteHttpUrl(input), init);
    }

    if (input instanceof URL) {
      return nativeFetch(new URL(rewriteHttpUrl(input.toString())), init);
    }

    const rewrittenUrl = rewriteHttpUrl(input.url);
    if (rewrittenUrl === input.url) {
      return nativeFetch(input, init);
    }

    const rewrittenRequest = new Request(rewrittenUrl, input);
    return nativeFetch(rewrittenRequest, init);
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
