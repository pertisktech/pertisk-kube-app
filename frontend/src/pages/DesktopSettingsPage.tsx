import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { isDesktopRuntime, setDesktopBackendPort } from '../utils/desktopBridge';
import {
  getDesktopSidecarConfig,
  listDesktopKubeconfigCandidates,
  restartDesktopSidecar,
  saveDesktopSidecarConfig,
} from '../utils/tauriDesktop';

export const DesktopSettingsPage = () => {
  const [backendBin, setBackendBin] = useState('');
  const [kubeconfigPath, setKubeconfigPath] = useState('');
  const [kubeContext, setKubeContext] = useState('');
  const [kubeconfigCandidates, setKubeconfigCandidates] = useState<string[]>([]);
  const [port, setPort] = useState(8091);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const desktopMode = isDesktopRuntime();

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const config = await getDesktopSidecarConfig();
        if (cancelled) return;
        setBackendBin(config.backendBin ?? '');
        setKubeconfigPath(config.kubeconfigPath ?? '');
        setKubeContext(config.kubeContext ?? '');
        setPort(config.port || 8091);

        const candidates = await listDesktopKubeconfigCandidates();
        if (cancelled) return;
        setKubeconfigCandidates(candidates);
      } catch (err) {
        if (cancelled) return;
        setStatus(err instanceof Error ? err.message : 'Failed to load desktop settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const normalizedPort = Number.isFinite(port) && port > 0 ? Math.floor(port) : 8091;
      await saveDesktopSidecarConfig({
        backendBin: backendBin.trim() ? backendBin.trim() : null,
        kubeconfigPath: kubeconfigPath.trim() ? kubeconfigPath.trim() : null,
        kubeContext: kubeContext.trim() ? kubeContext.trim() : null,
        port: normalizedPort,
      });
      setDesktopBackendPort(normalizedPort);
      setStatus('Desktop sidecar settings saved and backend restarted.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to save desktop settings.');
    } finally {
      setSaving(false);
    }
  };

  const onRestart = async () => {
    setRestarting(true);
    setStatus(null);
    try {
      await restartDesktopSidecar();
      setStatus('Desktop backend sidecar restarted.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to restart sidecar.');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card title="Desktop Sidecar Settings">
        <div className="p-6 space-y-4">
          {!desktopMode && (
            <p className="text-sm text-text-secondary">
              This page is available in Tauri desktop runtime. Use npm run tauri:dev or make run-desktop.
            </p>
          )}
          {loading ? (
            <p className="text-sm text-text-secondary">Loading desktop configuration...</p>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="desktop-backend-bin" className="block text-sm font-medium text-text-secondary">
                  Backend Binary Path (optional)
                </label>
                <input
                  id="desktop-backend-bin"
                  value={backendBin}
                  onChange={(e) => setBackendBin(e.target.value)}
                  disabled={!desktopMode}
                  placeholder="/absolute/path/to/pertisk-kube-backend"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="desktop-backend-port" className="block text-sm font-medium text-text-secondary">
                  Backend Port
                </label>
                <input
                  id="desktop-backend-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number.parseInt(e.target.value || '8091', 10))}
                  disabled={!desktopMode}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="desktop-kubeconfig-path" className="block text-sm font-medium text-text-secondary">
                  Kubeconfig Path
                </label>
                <input
                  id="desktop-kubeconfig-path"
                  value={kubeconfigPath}
                  onChange={(e) => setKubeconfigPath(e.target.value)}
                  disabled={!desktopMode}
                  placeholder="/Users/you/.kube/config"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
                {kubeconfigCandidates.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setKubeconfigPath(e.target.value);
                      }
                    }}
                    disabled={!desktopMode}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">Select discovered kubeconfig...</option>
                    {kubeconfigCandidates.map((candidate) => (
                      <option key={candidate} value={candidate}>{candidate}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="desktop-kubecontext" className="block text-sm font-medium text-text-secondary">
                  Cluster Context (optional)
                </label>
                <input
                  id="desktop-kubecontext"
                  value={kubeContext}
                  onChange={(e) => setKubeContext(e.target.value)}
                  disabled={!desktopMode}
                  placeholder="dev-cluster-context"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!desktopMode || saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  disabled={!desktopMode || restarting}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text disabled:opacity-60"
                >
                  {restarting ? 'Restarting...' : 'Restart Sidecar'}
                </button>
              </div>
            </>
          )}

          {status && <p className="text-sm text-text-secondary">{status}</p>}
        </div>
      </Card>
    </div>
  );
};
