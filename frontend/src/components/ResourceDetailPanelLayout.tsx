import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X, ChevronDown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { ResizablePanel } from './ResizablePanel';

/** Reusable panel action button with tooltip (Edit YAML, Delete, etc.) */
export const PanelActionButton = ({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10'
          : 'border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
      }`}
      aria-label={label}
    >
      <Icon size={12} />
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">
      {label}
    </div>
  </div>
);

export interface KeyInfoItem {
  label: string;
  value: ReactNode;
}

interface ResourceDetailPanelLayoutProps {
  /** Resource name shown as main title (e.g. pod name, node name) */
  title: string;
  /** Optional status for StatusBadge (e.g. "Ready", "Running") */
  status?: string;
  /** Optional key info row: 2–3 label/value pairs below header */
  keyInfo?: KeyInfoItem[];
  /** Action buttons (Edit YAML, Delete, etc.) */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared layout for all resource right panels so they match Node/Pod style:
 * header (name + status + close + actions), key info bar, scrollable section cards.
 */
export const ResourceDetailPanelLayout = ({
  title,
  status,
  keyInfo = [],
  actions,
  onClose,
  children,
}: ResourceDetailPanelLayoutProps) => {
  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        {/* Header: same as Node/Pod */}
        <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text truncate">{title}</h2>
              {status != null && (
                <div className="mt-2">
                  <StatusBadge status={status} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-hover text-text-secondary transition-colors flex-shrink-0"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>

          {actions && (
            <div className="flex gap-2 mt-3">
              {actions}
            </div>
          )}

          {keyInfo.length > 0 && (
            <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
              {keyInfo.map((item, idx) => (
                <div key={idx} className="flex-1 min-w-0">
                  <p className="text-text-secondary mb-1">{item.label}</p>
                  <p className="text-text font-medium truncate">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content: scrollable section cards */}
        <div className="flex-1 overflow-auto overflow-x-hidden p-4 space-y-4 text-sm">
          {children}
        </div>
      </div>
    </ResizablePanel>
  );
};

/** Section card for detail panel (same style as Node/Pod sections) */
export const DetailSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="bg-surface border border-border rounded-lg p-3.5">
    <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
      {title}
    </h3>
    {children}
  </section>
);

/** Single key-value row inside a section */
export const DetailRow = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) => (
  <div className="flex items-center justify-between text-xs py-2 border-t border-border first:border-t-0 first:pt-0">
    <span className="text-text-secondary font-medium">{label}</span>
    <span className={`text-text font-semibold break-all text-right ${mono ? 'font-mono' : ''}`}>
      {value ?? '-'}
    </span>
  </div>
);

/** Expandable Labels section (same style as Node/Pod). Always visible; shows count and empty state when no labels. */
export const DetailLabelsSection = ({ labels }: { labels?: Record<string, string> | null }) => {
  const [expanded, setExpanded] = useState(true);
  const entries = labels && typeof labels === 'object' && !Array.isArray(labels) ? Object.entries(labels) : [];
  const count = entries.length;
  return (
    <section className="bg-surface border border-border rounded-lg p-3.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Labels ({count})
        </h3>
        <ChevronDown
          size={14}
          className={`transform transition-transform text-text-secondary ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="space-y-2 text-xs mt-3 pt-3 border-t border-border">
          {count > 0 ? (
            entries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-2">
                <span className="text-text-secondary truncate">{key}:</span>
                <span className="text-text font-medium text-right break-all">{value}</span>
              </div>
            ))
          ) : (
            <p className="text-text-secondary">No labels</p>
          )}
        </div>
      )}
    </section>
  );
};

/** Expandable Annotations section (same style as Node/Pod). Always visible; shows count and empty state when no annotations. */
export const DetailAnnotationsSection = ({ annotations }: { annotations?: Record<string, string> | null }) => {
  const [expanded, setExpanded] = useState(true);
  const entries = annotations && typeof annotations === 'object' && !Array.isArray(annotations) ? Object.entries(annotations) : [];
  const count = entries.length;
  return (
    <section className="bg-surface border border-border rounded-lg p-3.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Annotations ({count})
        </h3>
        <ChevronDown
          size={14}
          className={`transform transition-transform text-text-secondary ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="space-y-2 text-xs mt-3 pt-3 border-t border-border">
          {count > 0 ? (
            entries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-2">
                <span className="text-text-secondary truncate">{key}:</span>
                <span className="text-text font-medium text-right break-all">{value}</span>
              </div>
            ))
          ) : (
            <p className="text-text-secondary">No annotations</p>
          )}
        </div>
      )}
    </section>
  );
};
