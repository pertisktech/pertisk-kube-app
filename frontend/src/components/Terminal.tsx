import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { getDesktopWebSocketBase, isDesktopRuntime } from '../utils/desktopBridge';
import { getAppThemeTerminalPalette, resolveTerminalThemePreset } from '../utils/themePresets';

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName?: string;
  initialCommand?: string;
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
  
  // Store settings in refs so the effect doesn't depend on them
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const themeRef = useRef(theme);
  themeRef.current = theme;

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
      if (fitAddonRef.current && xtermRef.current && terminalRef.current && terminalRef.current.offsetWidth > 0) {
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

    // Get current settings from refs
    const currentSettings = settingsRef.current;
    const currentTheme = themeRef.current;
    
    const terminalThemeDark = currentSettings.terminal.theme === 'auto'
      ? !!currentTheme?.isDark
      : currentSettings.terminal.theme === 'dark';
    
    // When theme is 'auto', use the app theme palette for consistency
    // Otherwise, use the custom terminal theme preset
    const terminalPalette = currentSettings.terminal.theme === 'auto'
      ? getAppThemeTerminalPalette(currentSettings.generalThemePreset, terminalThemeDark ? 'dark' : 'light')
      : resolveTerminalThemePreset(currentSettings.terminalThemePreset, terminalThemeDark ? 'dark' : 'light');
    
    const terminalFontFamily = toTerminalFontFamily(currentSettings.terminal.fontName);

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: currentSettings.terminal.fontSize,
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

    // Wait for container to have stable dimensions before opening terminal
    // This prevents the terminal from being sized to partial/zero width
    let lastWidth = 0;
    let stableCount = 0;
    const waitForStableWidth = () => {
      const currentWidth = terminalRef.current?.offsetWidth || 0;
      if (currentWidth > 0 && currentWidth === lastWidth) {
        stableCount++;
        if (stableCount >= 2) {
          // Width is stable, open terminal
          openTerminal();
          return;
        }
      } else {
        stableCount = 0;
        lastWidth = currentWidth;
      }
      requestAnimationFrame(waitForStableWidth);
    };

    const openTerminal = () => {
      if (!terminalRef.current) return;
      
      // Open terminal in DOM
      xterm.open(terminalRef.current);
      
      // Force viewport background to match theme (xterm doesn't always set this correctly)
      const viewport = terminalRef.current.querySelector('.xterm-viewport') as HTMLElement | null;
      if (viewport && terminalPalette.background) {
        viewport.style.backgroundColor = terminalPalette.background;
      }
      
      // Fit immediately after open
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore
      }
      
      xterm.focus();
    };

    // Start waiting for stable width
    waitForStableWidth();
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Fit terminal to container size
    const doFit = () => {
      if (fitAddonRef.current && terminalRef.current && terminalRef.current.offsetWidth > 0) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          // ignore fit errors
        }
      }
    };

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
      doFit();
      setTimeout(() => {
        doFit();
        sendResize();
      }, 50);
      setTimeout(() => {
        doFit();
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

    let connectionClosed = false;
    
    ws.onerror = () => {
      if (!connectionClosed) {
        xterm.writeln('\x1b[1;31m✗ Connection error\x1b[0m');
      }
    };

    ws.onclose = () => {
      connectionClosed = true;
      xterm.writeln('\r\n\x1b[90m[Session ended]\x1b[0m');
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
    const resizeObserver = new ResizeObserver((entries) => {
      // Only handle resize if container has valid dimensions
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        handleResize();
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
      // Immediate fit after observer attached
      doFit();
    }

    // Additional resize attempts to handle initial layout
    const layoutTimers = [
      window.setTimeout(() => {
        doFit();
        sendResize();
      }, 100),
      window.setTimeout(() => {
        doFit();
        sendResize();
      }, 200),
      window.setTimeout(() => {
        doFit();
        sendResize();
      }, 350),
      window.setTimeout(() => {
        doFit();
        sendResize();
      }, 500),
      // Additional fit for panels that may become visible later
      window.setTimeout(() => {
        doFit();
        sendResize();
      }, 1000),
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
  // Only reconnect when connection params change, not when settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podName, namespace, containerName, initialCommand]);

  // Update terminal theme/font when settings change (without reconnecting)
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    const terminalThemeDark = settings.terminal.theme === 'auto'
      ? !!theme?.isDark
      : settings.terminal.theme === 'dark';
    
    const terminalPalette = settings.terminal.theme === 'auto'
      ? getAppThemeTerminalPalette(settings.generalThemePreset, terminalThemeDark ? 'dark' : 'light')
      : resolveTerminalThemePreset(settings.terminalThemePreset, terminalThemeDark ? 'dark' : 'light');
    
    const terminalFontFamily = toTerminalFontFamily(settings.terminal.fontName);

    xterm.options.theme = terminalPalette;
    xterm.options.fontSize = settings.terminal.fontSize;
    xterm.options.fontFamily = terminalFontFamily;

    // Force update xterm viewport background (xterm doesn't auto-update inline styles)
    const viewport = terminalRef.current?.querySelector('.xterm-viewport') as HTMLElement | null;
    if (viewport && terminalPalette.background) {
      viewport.style.backgroundColor = terminalPalette.background;
    }

    // Refit after font changes
    if (fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
      } catch (e) {
        // ignore
      }
    }
  }, [
    theme?.isDark,
    settings.terminal.fontName,
    settings.terminal.fontSize,
    settings.terminal.theme,
    settings.terminalThemePreset,
    settings.generalThemePreset,
  ]);

  // Resolve terminal background color based on theme mode
  const terminalBgMode = settings.terminal.theme === 'auto' 
    ? (theme?.isDark ? 'dark' : 'light') 
    : settings.terminal.theme;
  const terminalBgColor = settings.terminal.theme === 'auto'
    ? getAppThemeTerminalPalette(settings.generalThemePreset, terminalBgMode).background
    : resolveTerminalThemePreset(settings.terminalThemePreset, terminalBgMode).background;

  return (
    <div
      ref={terminalRef}
      className="terminal-container w-full h-full bg-surface-elevated rounded-md"
      style={{ 
        background: terminalBgColor,
        minHeight: '200px',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    />
  );
};
