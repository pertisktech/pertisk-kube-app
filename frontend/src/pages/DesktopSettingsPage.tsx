import { useEffect, useState } from 'react';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { checkHelmRepository } from '../hooks/useKubernetes';
import { type IconComponent, Settings, Terminal, FileCode, Archive, Plus, Pencil, Trash2 } from '../components/Icons';

type SettingsTab = 'general' | 'terminal' | 'yaml' | 'helm';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; description: string; icon: IconComponent }> = [
  {
    id: 'general',
    label: 'General',
    description: 'Global behavior for this Kubernetes desktop client.',
    icon: Settings,
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Configure terminal appearance used by pod and node shell sessions.',
    icon: Terminal,
  },
  {
    id: 'yaml',
    label: 'Yaml Editor',
    description: 'Set default look-and-feel for YAML editing experiences.',
    icon: FileCode,
  },
  {
    id: 'helm',
    label: 'Helm',
    description: 'Configure Helm chart repository behavior used in install workflows.',
    icon: Archive,
  },
];

export const DesktopSettingsPage = () => {
  const { settings, setSettings } = useFeatureSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [terminalFontName, setTerminalFontName] = useState(settings.terminal.fontName);
  const [terminalFontSize, setTerminalFontSize] = useState(settings.terminal.fontSize);
  const [terminalTheme, setTerminalTheme] = useState(settings.terminal.theme);
  const [yamlFontName, setYamlFontName] = useState(settings.yamlEditor.fontName);
  const [yamlFontSize, setYamlFontSize] = useState(settings.yamlEditor.fontSize);
  const [yamlTheme, setYamlTheme] = useState(settings.yamlEditor.theme);
  const [helmRepositories, setHelmRepositories] = useState(settings.helmRepositories);
  const [helmRepoNameInput, setHelmRepoNameInput] = useState('');
  const [helmRepoUrlInput, setHelmRepoUrlInput] = useState('');
  const [helmRepoFavoriteInput, setHelmRepoFavoriteInput] = useState(false);
  const [helmRepoEnabledInput, setHelmRepoEnabledInput] = useState(true);
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [checkingRepoId, setCheckingRepoId] = useState<string | null>(null);
  const [repoCheckStatus, setRepoCheckStatus] = useState<string | null>(null);
  const [featureSaving, setFeatureSaving] = useState(false);
  const [featureStatus, setFeatureStatus] = useState<string | null>(null);

  useEffect(() => {
    setTerminalFontName(settings.terminal.fontName);
    setTerminalFontSize(settings.terminal.fontSize);
    setTerminalTheme(settings.terminal.theme);
    setYamlFontName(settings.yamlEditor.fontName);
    setYamlFontSize(settings.yamlEditor.fontSize);
    setYamlTheme(settings.yamlEditor.theme);
    setHelmRepositories(settings.helmRepositories);
  }, [settings]);

  const clampFontSize = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(32, Math.max(10, Math.round(value)));
  };

  const onSaveFeatureSettings = () => {
    setFeatureSaving(true);
    setFeatureStatus(null);
    try {
      setSettings({
        ...settings,
        terminal: {
          fontName: terminalFontName.trim() || 'JetBrains Mono',
          fontSize: clampFontSize(terminalFontSize, 13),
          theme: terminalTheme,
        },
        yamlEditor: {
          fontName: yamlFontName.trim() || 'JetBrains Mono',
          fontSize: clampFontSize(yamlFontSize, 13),
          theme: yamlTheme,
        },
        helmRepoUrl: helmRepositories.find((repo) => repo.enabled)?.url ?? '',
        helmRepositories,
      });
      setFeatureStatus('Terminal, YAML editor, and Helm repository settings saved.');
    } catch (err) {
      setFeatureStatus(err instanceof Error ? err.message : 'Failed to save feature settings.');
    } finally {
      setFeatureSaving(false);
    }
  };

  const activeTabMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

  const resetRepoEditor = () => {
    setEditingRepoId(null);
    setHelmRepoNameInput('');
    setHelmRepoUrlInput('');
    setHelmRepoFavoriteInput(false);
    setHelmRepoEnabledInput(true);
  };

  const submitRepoEditor = () => {
    const url = helmRepoUrlInput.trim();
    const name = helmRepoNameInput.trim();
    if (!url) {
      setFeatureStatus('Repository URL is required.');
      return;
    }

    if (editingRepoId) {
      setHelmRepositories((prev) => prev.map((repo) => (
        repo.id === editingRepoId
          ? { ...repo, name: name || repo.name, url, favorite: helmRepoFavoriteInput, enabled: helmRepoEnabledInput }
          : repo
      )));
      setFeatureStatus('Helm repository updated. Save Settings to persist.');
    } else {
      const parsedHostname = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return '';
        }
      })();
      const newRepo = {
        id: `repo-${Date.now()}`,
        name: name || parsedHostname || 'Custom Repository',
        url,
        favorite: helmRepoFavoriteInput,
        enabled: helmRepoEnabledInput,
      };
      setHelmRepositories((prev) => [...prev, newRepo]);
      setFeatureStatus('Helm repository added. Save Settings to persist.');
    }

    resetRepoEditor();
  };

  const beginEditRepo = (repoId: string) => {
    const repo = helmRepositories.find((item) => item.id === repoId);
    if (!repo) return;
    setEditingRepoId(repo.id);
    setHelmRepoNameInput(repo.name);
    setHelmRepoUrlInput(repo.url);
    setHelmRepoFavoriteInput(repo.favorite);
    setHelmRepoEnabledInput(repo.enabled);
    setRepoCheckStatus(null);
  };

  const deleteRepo = (repoId: string) => {
    setHelmRepositories((prev) => prev.filter((repo) => repo.id !== repoId));
    if (editingRepoId === repoId) resetRepoEditor();
    setFeatureStatus('Helm repository removed. Save Settings to persist.');
  };

  const runRepoCheck = async (repoId: string, repoUrl: string) => {
    setCheckingRepoId(repoId);
    setRepoCheckStatus(null);
    try {
      const result = await checkHelmRepository(repoUrl);
      setRepoCheckStatus(result.message || 'Repository check succeeded.');
    } catch (err) {
      setRepoCheckStatus(err instanceof Error ? err.message : 'Repository check failed.');
    } finally {
      setCheckingRepoId(null);
    }
  };

  return (
    <div className="h-full">
      <div className="grid h-full min-h-[540px] md:grid-cols-[220px,1fr]">
        <aside className="border-b border-border p-3 md:border-b-0 md:border-r">
            <nav className="space-y-1" aria-label="Settings sections">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-primary text-white' : 'text-text-secondary hover:bg-hover hover:text-text'}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <tab.icon size={16} className="flex-shrink-0" />
                    <span>{tab.label}</span>
                  </span>
                </button>
              ))}
            </nav>
        </aside>

        <section className="flex min-h-0 flex-col">
          <header className="border-b border-border px-6 py-4">
            <h3 className="inline-flex items-center gap-2 text-base font-semibold text-text">
              <activeTabMeta.icon size={18} className="flex-shrink-0 text-text-secondary" />
              <span>{activeTabMeta.label}</span>
            </h3>
            <p className="mt-1 text-sm text-text-secondary">{activeTabMeta.description}</p>
          </header>

          <div className="flex-1 overflow-auto p-6 space-y-6">
              {activeTab === 'general' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
                  <p>
                    Cluster connection and context switching are handled in the dedicated switch-cluster workflow.
                  </p>
                  <p>
                    Use Terminal, Yaml Editor, and Helm tabs to customize client behavior.
                  </p>
                </div>
              )}

              {activeTab === 'terminal' && (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="terminal-font-name" className="block text-sm font-medium text-text-secondary">
                        Terminal Font Name
                      </label>
                      <input
                        id="terminal-font-name"
                        value={terminalFontName}
                        onChange={(e) => setTerminalFontName(e.target.value)}
                        placeholder="JetBrains Mono"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="terminal-font-size" className="block text-sm font-medium text-text-secondary">
                        Terminal Font Size
                      </label>
                      <input
                        id="terminal-font-size"
                        type="number"
                        min={10}
                        max={32}
                        value={terminalFontSize}
                        onChange={(e) => setTerminalFontSize(Number.parseInt(e.target.value || '13', 10))}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="terminal-theme" className="block text-sm font-medium text-text-secondary">
                      Terminal Theme
                    </label>
                    <select
                      id="terminal-theme"
                      value={terminalTheme}
                      onChange={(e) => setTerminalTheme(e.target.value as 'auto' | 'light' | 'dark')}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="auto">Auto (follow app theme)</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'yaml' && (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="yaml-font-name" className="block text-sm font-medium text-text-secondary">
                        YAML Editor Font Name
                      </label>
                      <input
                        id="yaml-font-name"
                        value={yamlFontName}
                        onChange={(e) => setYamlFontName(e.target.value)}
                        placeholder="JetBrains Mono"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="yaml-font-size" className="block text-sm font-medium text-text-secondary">
                        YAML Editor Font Size
                      </label>
                      <input
                        id="yaml-font-size"
                        type="number"
                        min={10}
                        max={32}
                        value={yamlFontSize}
                        onChange={(e) => setYamlFontSize(Number.parseInt(e.target.value || '13', 10))}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="yaml-theme" className="block text-sm font-medium text-text-secondary">
                      YAML Editor Theme
                    </label>
                    <select
                      id="yaml-theme"
                      value={yamlTheme}
                      onChange={(e) => setYamlTheme(e.target.value as 'auto' | 'light' | 'dark')}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="auto">Auto (follow app theme)</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'helm' && (
                <div className="space-y-5">
                  <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="helm-repo-name" className="block text-sm font-medium text-text-secondary">
                        Repository Name
                      </label>
                      <input
                        id="helm-repo-name"
                        value={helmRepoNameInput}
                        onChange={(e) => setHelmRepoNameInput(e.target.value)}
                        placeholder="Bitnami"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="helm-repo-url" className="block text-sm font-medium text-text-secondary">
                        Repository URL
                      </label>
                      <input
                        id="helm-repo-url"
                        value={helmRepoUrlInput}
                        onChange={(e) => setHelmRepoUrlInput(e.target.value)}
                        placeholder="https://charts.bitnami.com/bitnami"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={helmRepoEnabledInput}
                        onChange={(e) => setHelmRepoEnabledInput(e.target.checked)}
                      />
                      <span>Enabled</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={helmRepoFavoriteInput}
                        onChange={(e) => setHelmRepoFavoriteInput(e.target.checked)}
                      />
                      <span>Favorite</span>
                    </label>
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={submitRepoEditor}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white"
                      >
                        <Plus size={14} />
                        {editingRepoId ? 'Update Repository' : 'Add Repository'}
                      </button>
                      {editingRepoId && (
                        <button
                          type="button"
                          onClick={resetRepoEditor}
                          className="rounded-md border border-border px-3 py-2 text-sm"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-elevated text-text-secondary">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">URL</th>
                          <th className="px-3 py-2 text-left font-medium">Flags</th>
                          <th className="px-3 py-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {helmRepositories.map((repo) => (
                          <tr key={repo.id} className="border-t border-border">
                            <td className="px-3 py-2 text-text">{repo.name}</td>
                            <td className="px-3 py-2 text-text-secondary truncate max-w-[420px]">{repo.url}</td>
                            <td className="px-3 py-2 text-text-secondary">
                              {repo.enabled ? 'Enabled' : 'Disabled'}{repo.favorite ? ' • Favorite' : ''}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void runRepoCheck(repo.id, repo.url)}
                                  disabled={checkingRepoId === repo.id}
                                  className="rounded-md border border-border px-2 py-1 text-xs"
                                >
                                  {checkingRepoId === repo.id ? 'Checking...' : 'Check'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => beginEditRepo(repo.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteRepo(repo.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-red-600"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {repoCheckStatus && (
                    <p className="text-xs text-text-secondary">{repoCheckStatus}</p>
                  )}

                  <p className="text-xs text-text-secondary">
                    Helm Charts page loads from enabled repositories in this list. Favorite repositories are auto-initialized.
                  </p>
                </div>
              )}
          </div>

          <footer className="border-t border-border px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onSaveFeatureSettings}
                disabled={featureSaving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {featureSaving ? 'Saving...' : 'Save Settings'}
              </button>
              {featureStatus && <p className="text-sm text-text-secondary">{featureStatus}</p>}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
};
