import { Upload, Trash2 } from 'lucide-react';
import type { HelmRelease } from '../types';
import { timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

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
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="Helm Release" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYaml(release)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Upgrade release values"><Upload size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Upgrade Release</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete(release.namespace, release.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Uninstall release"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Uninstall Release</div>
            </div>
          </div>
        </DetailPanelHeader>

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
    </ResizablePanel>
  );
};
