import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { createRealtimeTransport } from '../utils/realtimeTransport';

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName?: string;
  initialCommand?: string;
  onClose?: () => void;
}

const formatRealtimeTransportError = (err: unknown): string => {
  if (typeof err === 'string' && err.trim()) {
    return err;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'Realtime transport connection error';
};

const isFatalRealtimeTransportError = (err: unknown): boolean => {
  const normalized = formatRealtimeTransportError(err).toLowerCase();
  return normalized.includes('webtransport unsupported')
    || normalized.includes('backend does not advertise webtransport support')
    || normalized.includes('backend capability endpoint reports webtransport=false')
    || normalized.includes('wt-only mode blocked non-webtransport path');
};

const toTerminalFriendlyError = (err: unknown): string => {
  const normalized = formatRealtimeTransportError(err).toLowerCase();
  if (normalized.includes('webtransport unsupported')) {
    return 'Realtime terminal unavailable in this runtime. WebTransport requires HTTPS and browser support.';
  }
  if (
    normalized.includes('backend does not advertise webtransport support')
    || normalized.includes('backend capability endpoint reports webtransport=false')
  ) {
    return 'Realtime terminal unavailable. Backend WebTransport support is disabled.';
  }
  if (normalized.includes('wt-only mode blocked non-webtransport path')) {
    return 'Realtime terminal unavailable because WT-only mode is enabled.';
  }
  return formatRealtimeTransportError(err);
};

export const Terminal = ({ podName, namespace, containerName, initialCommand }: TerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const transportRef = useRef<ReturnType<typeof createRealtimeTransport> | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSentDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const theme = useTheme();

  const sendResize = () => {
    const transport = transportRef.current;
    const xterm = xtermRef.current;

    if (!transport || !xterm || !transport.isOpen()) {
      return;
    }

    const current = { cols: xterm.cols, rows: xterm.rows };
    const last = lastSentDimensionsRef.current;

    // Only send if dimensions have actually changed
    if (last && last.cols === current.cols && last.rows === current.rows) {
      return;
    }

    lastSentDimensionsRef.current = current;
    transport.send(
      JSON.stringify({
        type: 'resize',
        rows: xterm.rows,
        cols: xterm.cols,
      })
    );
  };

  const handleResize = () => {
    if (resizeTimeoutRef.current) {
      window.clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = window.setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          sendResize();
        } catch (error) {
          console.error('Error during terminal resize:', error);
        }
      }
    }, 50);
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    // Get actual theme colors from CSS variables
    const computedStyle = getComputedStyle(document.documentElement);
    const surfaceElevated = computedStyle.getPropertyValue('--color-surface-elevated').trim() || (theme?.isDark ? '#15161e' : '#f5f5f5');
    const textColor = computedStyle.getPropertyValue('--color-text').trim() || (theme?.isDark ? '#e8e8e9' : '#1a1a1a');

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        '"JetBrainsMono Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      allowProposedApi: true,
      convertEol: true,
      rows: 30,
      cols: 120,
      scrollback: 1000,
      theme: {
        background: surfaceElevated,
        foreground: textColor,
        cursor: textColor,
        black: '#000000',
        red: '#cd3131',
        green: theme?.isDark ? '#0dbc79' : '#00bc00',
        yellow: theme?.isDark ? '#e5e510' : '#949800',
        blue: theme?.isDark ? '#2472c8' : '#0451a5',
        magenta: theme?.isDark ? '#bc3fbc' : '#bc05bc',
        cyan: theme?.isDark ? '#11a8cd' : '#0598bc',
        white: theme?.isDark ? '#e5e5e5' : '#555555',
        brightBlack: '#666666',
        brightRed: theme?.isDark ? '#f14c4c' : '#cd3131',
        brightGreen: theme?.isDark ? '#23d18b' : '#14ce14',
        brightYellow: theme?.isDark ? '#f5f543' : '#b5ba00',
        brightBlue: theme?.isDark ? '#3b8eea' : '#0451a5',
        brightMagenta: theme?.isDark ? '#d670d6' : '#bc05bc',
        brightCyan: theme?.isDark ? '#29b8db' : '#0598bc',
        brightWhite: theme?.isDark ? '#ffffff' : '#a5a5a5',
      },
    });

    // Add addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in DOM
    xterm.open(terminalRef.current);
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Fit multiple times to ensure proper sizing before connection
    const performInitialFit = () => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        // Fit again to handle any layout shifts
        requestAnimationFrame(() => {
          fitAddon.fit();
        });
      });
    };
    
    performInitialFit();
    xterm.focus();

    // Connect WebSocket for shell
    const execPath = `/api/exec?namespace=${encodeURIComponent(
      namespace
    )}&pod=${encodeURIComponent(podName)}${containerName ? `&container=${encodeURIComponent(containerName)}` : ''}`;

    const transport = createRealtimeTransport({
      path: execPath,
      debugLabel: 'exec-shell',
      allowWebSocketFallback: true,
    });
    transportRef.current = transport;
    let fatalTransportClose = false;

    transport.onOpen = () => {
      xterm.writeln('\x1b[1;32m✓ Connected to pod shell\x1b[0m');
      xterm.writeln(`\x1b[1;36mPod:\x1b[0m ${namespace}/${podName}`);
      if (containerName) {
        xterm.writeln(`\x1b[1;36mContainer:\x1b[0m ${containerName}`);
      }
      xterm.writeln('');
      // Auto-focus terminal after connection
      xterm.focus();
      
      // Ensure terminal is properly sized before sending dimensions
      fitAddon.fit();
      setTimeout(() => {
        fitAddon.fit();
        sendResize();
      }, 50);
      setTimeout(() => {
        fitAddon.fit();
        sendResize();
      }, 150);

      if (namespace === 'node') {
        setTimeout(() => {
          if (transport.isOpen()) {
            transport.send('\n');
          }
        }, 180);
      }

      if (initialCommand && initialCommand.trim().length > 0) {
        setTimeout(() => {
          if (transport.isOpen()) {
            transport.send(`${initialCommand.trim()}\n`);
          }
        }, 220);
      }
    };

    transport.onMessage = (data) => {
      xterm.write(data);
    };

    transport.onError = (errorEvent) => {
      const friendly = toTerminalFriendlyError(errorEvent);
      fatalTransportClose = isFatalRealtimeTransportError(errorEvent);
      xterm.writeln(`\x1b[1;31m✗ ${friendly}\x1b[0m`);
    };

    transport.onClose = () => {
      if (!fatalTransportClose) {
        xterm.writeln('\r\n\x1b[1;33m✗ Connection closed\x1b[0m');
      }
    };

    // Send terminal input directly to shell (pass-through mode)
    xterm.onData((data) => {
      if (transport.isOpen()) {
        transport.send(data);
      }
    });

    const handleFocus = () => {
      xterm.focus();
    };

    terminalRef.current.addEventListener('mousedown', handleFocus);

    // Observe container size changes for responsive terminal
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Additional resize attempts to handle initial layout
    const layoutTimers = [
      window.setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          sendResize();
        }
      }, 250),
      window.setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          sendResize();
        }
      }, 500),
    ];

    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      terminalRef.current?.removeEventListener('mousedown', handleFocus);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      layoutTimers.forEach((timer) => window.clearTimeout(timer));
      transport.close();
      xterm.dispose();
    };
  }, [podName, namespace, containerName, initialCommand, theme?.isDark]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full bg-surface-elevated rounded-md"
      style={{ 
        minHeight: '200px',
        position: 'relative',
        overflow: 'hidden'
      }}
    />
  );
};
