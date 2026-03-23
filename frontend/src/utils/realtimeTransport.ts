export type RealtimeTransportMode = 'auto' | 'websocket' | 'webtransport';

export interface RealtimeTransportClient {
  readonly mode: 'websocket' | 'webtransport';
  isOpen: () => boolean;
  send: (data: string) => void;
  close: () => void;
  onOpen: (() => void) | null;
  onMessage: ((data: string) => void) | null;
  onError: ((event: unknown) => void) | null;
  onClose: (() => void) | null;
}

export interface CreateRealtimeTransportOptions {
  path: string;
  mode?: RealtimeTransportMode;
  debugLabel?: string;
}

interface RealtimeTransportCapabilities {
  websocket: boolean;
  webtransport: boolean;
  webtransport_path?: string | null;
}

const supportedModes: RealtimeTransportMode[] = ['auto', 'websocket', 'webtransport'];
const CAPABILITIES_STORAGE_KEY = 'pertisk-realtime-capabilities';
const DEFAULT_CAPABILITIES: RealtimeTransportCapabilities = {
  websocket: true,
  webtransport: false,
  webtransport_path: null,
};
let cachedCapabilities: RealtimeTransportCapabilities | null = null;
let probeStarted = false;
let fallbackReasonLogged = false;
let unsupportedReasonLogged = false;

export const getRealtimeTransportMode = (): RealtimeTransportMode => {
  const raw = String(import.meta.env.VITE_REALTIME_TRANSPORT || 'webtransport').toLowerCase();
  const parsed = supportedModes.includes(raw as RealtimeTransportMode)
    ? (raw as RealtimeTransportMode)
    : 'webtransport';

  // WT-only policy: force effective mode to WebTransport.
  if (parsed === 'websocket' || parsed === 'auto') {
    return 'webtransport';
  }

  return parsed;
};

const isWebTransportEnvironmentSupported = (): boolean => {
  const maybeWindow = window as Window & { WebTransport?: unknown };
  return typeof maybeWindow.WebTransport !== 'undefined' && window.location.protocol === 'https:';
};

const toWebTransportUrl = (path: string): string => {
  return `https://${window.location.host}${path}`;
};

const shouldLogTransportDebug = (): boolean =>
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const safeLoadCapabilitiesFromStorage = (): RealtimeTransportCapabilities | null => {
  try {
    const raw = window.localStorage.getItem(CAPABILITIES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RealtimeTransportCapabilities>;
    return {
      websocket: parsed.websocket !== false,
      webtransport: parsed.webtransport === true,
      webtransport_path: typeof parsed.webtransport_path === 'string' ? parsed.webtransport_path : null,
    };
  } catch {
    return null;
  }
};

const safeSaveCapabilitiesToStorage = (caps: RealtimeTransportCapabilities) => {
  try {
    window.localStorage.setItem(CAPABILITIES_STORAGE_KEY, JSON.stringify(caps));
  } catch {
    // Ignore storage write failures.
  }
};

const getCachedCapabilities = (): RealtimeTransportCapabilities => {
  if (cachedCapabilities) return cachedCapabilities;
  if (typeof window === 'undefined') return DEFAULT_CAPABILITIES;
  cachedCapabilities = safeLoadCapabilitiesFromStorage() ?? DEFAULT_CAPABILITIES;
  return cachedCapabilities;
};

export const primeRealtimeTransportCapabilities = async (): Promise<RealtimeTransportCapabilities> => {
  if (typeof window === 'undefined') return DEFAULT_CAPABILITIES;

  try {
    const res = await fetch('/api/realtime/capabilities', { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = (await res.json()) as Partial<RealtimeTransportCapabilities>;
    const next: RealtimeTransportCapabilities = {
      websocket: body.websocket !== false,
      webtransport: body.webtransport === true,
      webtransport_path: typeof body.webtransport_path === 'string' ? body.webtransport_path : null,
    };

    cachedCapabilities = next;
    safeSaveCapabilitiesToStorage(next);
    return next;
  } catch {
    return getCachedCapabilities();
  }
};

const triggerCapabilitiesProbe = () => {
  if (probeStarted || typeof window === 'undefined') return;
  probeStarted = true;
  void primeRealtimeTransportCapabilities();
};

const createFailedTransport = (mode: 'webtransport', error: string): RealtimeTransportClient => {
  let closed = false;
  const client: RealtimeTransportClient = {
    mode,
    onOpen: null,
    onMessage: null,
    onError: null,
    onClose: null,
    isOpen: () => false,
    send: () => {
      // no-op
    },
    close: () => {
      if (closed) return;
      closed = true;
      client.onClose?.();
    },
  };

  setTimeout(() => {
    if (closed) return;
    client.onError?.(new Error(error));
    client.onClose?.();
    closed = true;
  }, 0);

  return client;
};

const createWebTransportTransport = (path: string): RealtimeTransportClient => {
  const maybeWindow = window as unknown as { WebTransport?: typeof WebTransport };
  const WebTransportCtor = maybeWindow.WebTransport;

  if (!WebTransportCtor) {
    return createFailedTransport('webtransport', 'WebTransport API is not available in this runtime.');
  }

  const wt = new WebTransportCtor(toWebTransportUrl(path));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let opened = false;
  let closedByClient = false;
  let closeNotified = false;
  const sendQueue: string[] = [];

  const notifyClose = (client: RealtimeTransportClient) => {
    if (closeNotified) return;
    closeNotified = true;
    client.onClose?.();
  };

  const client: RealtimeTransportClient = {
    mode: 'webtransport',
    onOpen: null,
    onMessage: null,
    onError: null,
    onClose: null,
    isOpen: () => opened && !closeNotified,
    send: (data: string) => {
      if (writer) {
        void writer.write(encoder.encode(data));
        return;
      }
      sendQueue.push(data);
    },
    close: () => {
      if (closedByClient) return;
      closedByClient = true;
      try {
        wt.close();
      } catch {
        // ignore
      }
      notifyClose(client);
    },
  };

  const startReadLoop = async () => {
    if (!reader) return;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          client.onMessage?.(decoder.decode(value));
        }
      }
    } catch (err) {
      if (!closedByClient) {
        client.onError?.(err);
      }
    } finally {
      if (!closedByClient) {
        notifyClose(client);
      }
    }
  };

  void (async () => {
    try {
      await wt.ready;
      opened = true;
      writer = wt.datagrams.writable.getWriter();
      reader = wt.datagrams.readable.getReader();
      client.onOpen?.();

      while (sendQueue.length > 0 && writer) {
        const next = sendQueue.shift();
        if (next == null) break;
        await writer.write(encoder.encode(next));
      }

      void startReadLoop();
    } catch (err) {
      client.onError?.(err);
      notifyClose(client);
    }
  })();

  void wt.closed
    .catch((err) => {
      if (!closedByClient) {
        client.onError?.(err);
      }
    })
    .finally(() => {
      if (!closedByClient) {
        notifyClose(client);
      }
    });

  return client;
};

export const createRealtimeTransport = ({
  path: _path,
  mode = getRealtimeTransportMode(),
  debugLabel,
}: CreateRealtimeTransportOptions): RealtimeTransportClient => {
  const caps = getCachedCapabilities();
  triggerCapabilitiesProbe();

  const webTransportSupported = isWebTransportEnvironmentSupported();
  const canAttemptWebTransport = webTransportSupported && caps.webtransport;
  const effectiveWebTransportPath = caps.webtransport_path || '/wt';

  if ((mode === 'webtransport' || mode === 'auto') && shouldLogTransportDebug()) {
    if (!webTransportSupported) {
      if (mode === 'webtransport') {
        if (!unsupportedReasonLogged) {
          unsupportedReasonLogged = true;
          console.warn(
            '[realtime-transport] WebTransport unsupported in this environment (requires HTTPS + browser WebTransport API). WT-only mode will fail realtime streams.'
          );
        }
      }
    } else if (!caps.webtransport) {
      if (mode === 'webtransport') {
        return createFailedTransport(
          'webtransport',
          `[realtime-transport${debugLabel ? `:${debugLabel}` : ''}] Backend capability endpoint reports webtransport=false.`
        );
      } else if (!fallbackReasonLogged) {
        fallbackReasonLogged = true;
        console.info(
          '[realtime-transport] WT-only mode active; backend webtransport=false will fail streams.'
        );
      }
    } else if (mode === 'webtransport') {
      console.info(
        `[realtime-transport${debugLabel ? `:${debugLabel}` : ''}] Using WebTransport path ${effectiveWebTransportPath}.`
      );
    }
  }

  if (mode === 'webtransport') {
    if (!webTransportSupported) {
      return createFailedTransport(
        'webtransport',
        `[realtime-transport${debugLabel ? `:${debugLabel}` : ''}] WebTransport unsupported in this environment (requires HTTPS + browser WebTransport API).`
      );
    }
    if (!caps.webtransport) {
      return createFailedTransport(
        'webtransport',
        `[realtime-transport${debugLabel ? `:${debugLabel}` : ''}] Backend does not advertise WebTransport support.`
      );
    }

    return createWebTransportTransport(effectiveWebTransportPath);
  }

  if (mode === 'auto' && canAttemptWebTransport) {
    return createWebTransportTransport(effectiveWebTransportPath);
  }

  return createFailedTransport(
    'webtransport',
    `[realtime-transport${debugLabel ? `:${debugLabel}` : ''}] WT-only mode blocked non-WebTransport path.`
  );
};
