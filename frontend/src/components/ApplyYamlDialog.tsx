import { useEffect, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { X } from './Icons';
import { useTheme } from '../context/ThemeContext';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { getAuthToken } from '../utils/auth';

const DEFAULT_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
  namespace: default
  labels:
    app: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx:latest
          ports:
            - containerPort: 80
`;

interface ApplyYamlDialogProps {
  onClose: () => void;
}

const splitYamlDocuments = (yamlText: string): string[] => {
  const normalized = yamlText.split('\r\n').join('\n').trim();
  if (!normalized) return [];
  const docs = normalized
    .split(/^\s*---\s*$/m)
    .map((doc: string) => doc.trim())
    .filter(Boolean);
  return docs.length > 0 ? docs : [normalized];
};

export const ApplyYamlDialog = ({ onClose }: ApplyYamlDialogProps) => {
  const theme = useTheme();
  const { settings } = useFeatureSettings();
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleApply = async () => {
    if (!yaml.trim()) return;
    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getAuthToken();
      const docs = splitYamlDocuments(yaml);
      if (docs.length === 0) {
        throw new Error('YAML is empty.');
      }

      let lastMessage = 'Resource applied successfully';
      for (let index = 0; index < docs.length; index += 1) {
        const res = await fetch('/api/apply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/yaml',
            ...(token ? { Authorization: token } : {}),
          },
          body: docs[index],
        });
        const data = await res.json().catch(() => ({ message: res.statusText }));
        if (!res.ok) {
          const baseMessage = data.message || `Failed to apply (${res.status})`;
          const withIndex = docs.length > 1
            ? `Document ${index + 1}/${docs.length}: ${baseMessage}`
            : baseMessage;
          throw new Error(withIndex);
        }
        lastMessage = data.message || lastMessage;
      }

      setSuccess(docs.length > 1 ? `Applied ${docs.length} YAML documents successfully.` : lastMessage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col overflow-hidden"
        style={{ height: 'clamp(480px, 70vh, 800px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs rounded bg-hover text-[var(--color-primary)] font-semibold">
              Apply YAML
            </span>
            <span className="text-xs text-text-secondary">Create or update any Kubernetes resource</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Editor */}
        <div className="yaml-editor-pane flex-1 overflow-hidden">
          <AceEditor
            mode="yaml"
            theme={(settings.yamlEditor.theme === 'auto' ? !!theme?.isDark : settings.yamlEditor.theme === 'dark') ? 'tomorrow_night' : 'github'}
            name="apply-yaml-editor"
            value={yaml}
            onChange={setYaml}
            width="100%"
            height="100%"
            fontSize={settings.yamlEditor.fontSize}
            showPrintMargin={false}
            setOptions={{
              useWorker: false,
              wrap: false,
              tabSize: 2,
              showLineNumbers: true,
            }}
            editorProps={{ $blockScrolling: true }}
            style={{ fontFamily: settings.yamlEditor.fontName }}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-3 space-y-2">
          {error && (
            <div className="px-3 py-2 text-sm text-[var(--color-icon-danger)] border border-border rounded-md bg-surface-elevated">
              {error}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 text-sm text-[var(--color-icon-success)] border border-border rounded-md bg-surface-elevated">
              {success}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !yaml.trim()}
              className="px-4 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-bg disabled:opacity-60"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
