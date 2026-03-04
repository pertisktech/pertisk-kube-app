import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName?: string;
  onClose?: () => void;
}

export const Terminal = ({ podName, namespace, containerName }: TerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme?.isDark
        ? {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#ffffff',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff',
          }
        : {
            background: '#ffffff',
            foreground: '#000000',
            cursor: '#000000',
            black: '#000000',
            red: '#cd3131',
            green: '#00bc00',
            yellow: '#949800',
            blue: '#0451a5',
            magenta: '#bc05bc',
            cyan: '#0598bc',
            white: '#555555',
            brightBlack: '#666666',
            brightRed: '#cd3131',
            brightGreen: '#14ce14',
            brightYellow: '#b5ba00',
            brightBlue: '#0451a5',
            brightMagenta: '#bc05bc',
            brightCyan: '#0598bc',
            brightWhite: '#a5a5a5',
          },
      rows: 30,
      cols: 120,
      scrollback: 1000,
      allowProposedApi: true,
    });

    // Add addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in DOM
    xterm.open(terminalRef.current);
    fitAddon.fit();
    xterm.focus();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket for shell
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/exec?namespace=${encodeURIComponent(
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
    };

    ws.onmessage = (event) => {
      xterm.write(event.data);
    };

    ws.onerror = () => {
      xterm.writeln('\x1b[1;31m✗ WebSocket error\x1b[0m');
    };

    ws.onclose = () => {
      xterm.writeln('\r\n\x1b[1;33m✗ Connection closed\x1b[0m');
    };

    // Send terminal input to WebSocket
    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleFocus = () => {
      xterm.focus();
    };

    terminalRef.current.addEventListener('mousedown', handleFocus);

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            rows: xterm.rows,
            cols: xterm.cols,
          })
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      terminalRef.current?.removeEventListener('mousedown', handleFocus);
      window.removeEventListener('resize', handleResize);
      ws.close();
      xterm.dispose();
    };
  }, [podName, namespace, containerName, theme?.isDark]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full bg-[#1e1e1e] dark:bg-[#1e1e1e] rounded-md overflow-hidden"
      style={{ minHeight: '200px' }}
    />
  );
};
