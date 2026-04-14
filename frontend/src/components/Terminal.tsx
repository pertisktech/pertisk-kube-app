import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { getDesktopWebSocketBase, isDesktopRuntime } from '../utils/desktopBridge';
import { resolveTerminalThemePreset } from '../utils/themePresets';

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName?: string;
  initialCommand?: string;
  onClose?: () => void;
}

function toTerminalFontFamily(fontName: string): string {
  const normalized = fontName.trim();
  if (!normalized || normalized === 'Meslo Nerd Font') {
    return '"MesloLGM Nerd Font", "MesloLGL Nerd Font", "JetBrainsMono Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  }
  if (normalized === 'JetBrainsMono Nerd Font') {
    return '"JetBrainsMono Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  }
  return `"${normalized}", "JetBrainsMono Nerd Font", "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
}

export const Terminal = ({ podName, namespace, containerName, initialCommand }: TerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSentDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const theme = useTheme();
  const { settings } = useFeatureSettings();

  const sendResize = () => {
    const ws = wsRef.current;
    const xterm = xtermRef.current;

    if (!ws || !xterm || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const current = { cols: xterm.cols, rows: xterm.rows };
    const last = lastSentDimensionsRef.current;

    // Only send if dimensions have actually changed
    if (last && last.cols === current.cols && last.rows === current.rows) {
      return;
    }

    lastSentDimensionsRef.current = current;
    ws.send(
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

    const terminalThemeDark = settings.terminal.theme === 'auto'
      ? !!theme?.isDark
      : settings.terminal.theme === 'dark';
    const terminalPalette = resolveTerminalThemePreset(
      settings.terminalThemePreset,
      terminalThemeDark ? 'dark' : 'light',
    );
    const terminalFontFamily = toTerminalFontFamily(settings.terminal.fontName);

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: settings.terminal.fontSize,
      fontFamily: terminalFontFamily,
      allowProposedApi: true,
      convertEol: true,
      rows: 30,
      cols: 120,
      scrollback: 1000,
      theme: terminalPalette,
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
    const wsBase = isDesktopRuntime()
      ? getDesktopWebSocketBase()
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/exec?namespace=${encodeURIComponent(
      namespace
    )}&pod=${encodeURIComponent(podName)}${containerName ? `&container=${encodeURIComponent(containerName)}` : ''}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
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
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('\n');
          }
        }, 180);
      }

      if (initialCommand && initialCommand.trim().length > 0) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`${initialCommand.trim()}\n`);
          }
        }, 220);
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        xterm.write(event.data);
      }
    };

    ws.onerror = () => {
      xterm.writeln('\x1b[1;31m✗ WebSocket error\x1b[0m');
    };

    ws.onclose = () => {
      xterm.writeln('\r\n\x1b[1;33m✗ Connection closed\x1b[0m');
    };

    // Send terminal input directly to shell (pass-through mode)
    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
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
      ws.close();
      xterm.dispose();
    };
  }, [
    podName,
    namespace,
    containerName,
    initialCommand,
    theme?.isDark,
    settings.terminal.fontName,
    settings.terminal.fontSize,
    settings.terminal.theme,
    settings.terminalThemePreset,
  ]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full bg-surface-elevated rounded-md"
      style={{ 
        background: resolveTerminalThemePreset(
          settings.terminalThemePreset,
          settings.terminal.theme === 'auto' ? (theme?.isDark ? 'dark' : 'light') : settings.terminal.theme,
        ).background,
        minHeight: '200px',
        position: 'relative',
        overflow: 'hidden'
      }}
    />
  );
};
