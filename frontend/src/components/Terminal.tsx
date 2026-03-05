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
      fontFamily: '"MesloLGS NF", Menlo, Monaco, "Courier New", monospace',
      allowProposedApi: true,
      rows: 30,
      cols: 120,
      scrollback: 1000,
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
    let commandBuffer = '';
    let currentPath = '/';
    let pendingOutput = '';
    const pwdMarkerStart = '__PTK_PWD__';
    const pwdMarkerEnd = '__PTK_END__';

    const renderPromptPath = (path: string) => {
      const normalized = path?.trim() || '/';
      const homeDir = '/home/appuser';
      if (normalized === homeDir) return '~';
      if (normalized.startsWith(`${homeDir}/`)) {
        return `~/${normalized.slice(homeDir.length + 1)}`;
      }
      return normalized;
    };

    const writePrompt = () => {
      const promptPath = renderPromptPath(currentPath);
      xterm.write(`\x1b[38;5;76m➜\x1b[0m  \x1b[38;5;39m${promptPath}\x1b[0m `);
    };

    const handleCtrlC = () => {
      commandBuffer = '';
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('\u0003');
      }
    };

    const normalizeLineEndings = (text: string) =>
      text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');

    const processIncomingData = (chunk: string) => {
      pendingOutput += chunk;
      const tailReserve = Math.max(0, pwdMarkerStart.length - 1);

      while (true) {
        const markerStart = pendingOutput.indexOf(pwdMarkerStart);

        if (markerStart === -1) {
          if (pendingOutput.length > tailReserve) {
            const safeOutput = pendingOutput.slice(0, pendingOutput.length - tailReserve);
            xterm.write(normalizeLineEndings(safeOutput));
            pendingOutput = pendingOutput.slice(pendingOutput.length - tailReserve);
          }
          return;
        }

        if (markerStart > 0) {
          xterm.write(normalizeLineEndings(pendingOutput.slice(0, markerStart)));
        }

        const pathStart = markerStart + pwdMarkerStart.length;
        const markerEnd = pendingOutput.indexOf(pwdMarkerEnd, pathStart);

        if (markerEnd === -1) {
          pendingOutput = pendingOutput.slice(markerStart);
          return;
        }

        const parsedPath = pendingOutput
          .slice(pathStart, markerEnd)
          .replace(/\r?\n/g, '')
          .trim();

        if (parsedPath.length > 0) {
          currentPath = parsedPath;
        }

        pendingOutput = pendingOutput.slice(markerEnd + pwdMarkerEnd.length);
        xterm.write('\r\n');
        writePrompt();
      }
    };

    ws.onopen = () => {
      xterm.writeln('\x1b[1;32m✓ Connected to pod shell\x1b[0m');
      xterm.writeln(`\x1b[1;36mPod:\x1b[0m ${namespace}/${podName}`);
      if (containerName) {
        xterm.writeln(`\x1b[1;36mContainer:\x1b[0m ${containerName}`);
      }
      xterm.writeln('');
      ws.send(`printf '${pwdMarkerStart}%s${pwdMarkerEnd}' "$PWD"\n`);
      // Auto-focus terminal after connection
      xterm.focus();
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        processIncomingData(event.data);
      }
    };

    ws.onerror = () => {
      xterm.writeln('\x1b[1;31m✗ WebSocket error\x1b[0m');
    };

    ws.onclose = () => {
      xterm.writeln('\r\n\x1b[1;33m✗ Connection closed\x1b[0m');
    };

    const keyHandlerDisposable = xterm.onKey(({ domEvent }) => {
      if (
        domEvent.type === 'keydown' &&
        !domEvent.repeat &&
        domEvent.ctrlKey &&
        domEvent.key.toLowerCase() === 'c'
      ) {
        domEvent.preventDefault();
        handleCtrlC();
      }
    });

    // Send terminal input to WebSocket
    xterm.onData((data) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          xterm.write('\r\n');
          ws.send(`${commandBuffer}\nprintf '${pwdMarkerStart}%s${pwdMarkerEnd}' "$PWD"\n`);
          commandBuffer = '';
          continue;
        }

        if (ch === '\x7f') {
          if (commandBuffer.length > 0) {
            commandBuffer = commandBuffer.slice(0, -1);
            xterm.write('\b \b');
          }
          continue;
        }

        if (ch === '\u0003') {
          continue;
        }

        const code = ch.charCodeAt(0);
        const isPrintable = code >= 32 && code !== 127;
        if (isPrintable) {
          commandBuffer += ch;
          xterm.write(ch);
        }
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
      keyHandlerDisposable.dispose();
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
