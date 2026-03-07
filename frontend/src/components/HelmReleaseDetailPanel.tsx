import { Pencil, Trash2, X } from 'lucide-react';
import type { HelmRelease } from '../types';
import { timeAgo } from '../utils';

const getStatusClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'deployed') return 'status-green';
  if (s === 'failed') return 'status-red';
  if (s.startsWith('pending') || s === 'uninstalling') return 'status-yellow';
  return 'status-gray';
};

interface HelmReleaseDetailPanelProps {
  release: HelmRelease;
  onClose: () => void;
  onOpenYaml: (release: HelmRelease) => void;
  onDelete: (namespace: string, name: string) => void;
}

export const HelmReleaseDetailPanel = ({
  release,
  onClose,
  onOpenYaml,
  onDelete,
}: HelmReleaseDetailPanelProps) => {
  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Helm Release</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-5 py-3 border-b border-border">
          <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenYaml(release)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
              aria-label="View release YAML"
              data-tooltip="View YAML"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(release.namespace, release.name)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
              aria-label="Uninstall release"
              data-tooltip="Uninstall Release"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4 space-y-3">
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Name</p>
              <p className="text-primary font-medium break-all">{release.name}</p>
            </div>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Namespace</p>
              <p className="font-mono text-text">{release.namespace}</p>
            </div>
            <div>
              <p className="text-text-secondary text-xs mb-1">Status</p>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(release.status)}`}>
                {release.status}
              </span>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Chart</h3>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Chart Name</p>
              <p className="text-text">{release.chart !== '-' ? release.chart : release.name}</p>
            </div>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Chart Version</p>
              <p className="font-mono text-text">{release.chart_version || '-'}</p>
            </div>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">App Version</p>
              <p className="font-mono text-text">{release.app_version || '-'}</p>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Deploy</h3>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Revision</p>
              <p className="text-text">{release.revision}</p>
            </div>
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Last Updated</p>
              <p className="text-text">{release.updated ? timeAgo(release.updated) : '-'}</p>
            </div>
          </section>

        </div>
      </div>
    </aside>
  );
};
