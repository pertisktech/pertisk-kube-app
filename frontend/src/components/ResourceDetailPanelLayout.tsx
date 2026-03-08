import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { ResizablePanel } from './ResizablePanel';

/** Reusable panel action button with tooltip — used in the right-panel header toolbar */
export const PanelActionButton = ({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  colorClass = 'text-amber-400 hover:bg-amber-500/20 hover:text-amber-300',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  colorClass?: string;
}) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300' : colorClass
      }`}
      aria-label={label}
    >
      <Icon size={16} />
    </button>
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm"
      style={{
        backgroundColor: 'var(--color-surface-elevated)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      }}
    >
      {label}
    </div>
  </div>
);

export interface KeyInfoItem {
  label: string;
  value: ReactNode;
}

export interface StatusCardItem {
  label: string;
  value: ReactNode;
  colorClass?: string;
  bgClass?: string;
}

export interface QuickInfoItem {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
}

interface ResourceDetailPanelLayoutProps {
  /** Resource kind label (e.g. "POD", "DEPLOYMENT") — base project style when set */
  kind?: string;
  /** Icon for kind (e.g. Box, Layers) */
  kindIcon?: LucideIcon;
  /** Resource name shown as main title */
  title: string;
  /** Optional status for badge (e.g. "Ready", "Running") */
  status?: string;
  /** Optional status cards grid (2–3 cards: Status, Ready, Restarts, etc.) — base style */
  statusCards?: StatusCardItem[];
  /** Optional quick info row with icons (Age, Node, etc.) */
  quickInfo?: QuickInfoItem[];
  /** Optional key info row (fallback when no statusCards/quickInfo) */
  keyInfo?: KeyInfoItem[];
  /** Action buttons (Edit YAML, Delete, etc.) */
  actions?: ReactNode;
  /** When true, title uses break-words and does not truncate (e.g. for long MWC/VWC names) */
  titleFullText?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared layout for all resource right panels — matches base project (pertisk-kube):
 * header (kind + icon + actions + close), summary (name, namespace, status cards, quick info), scrollable sections.
 */
export const ResourceDetailPanelLayout = ({
  kind,
  kindIcon: KindIcon,
  title,
  statusCards = [],
  quickInfo = [],
  keyInfo = [],
  actions,
  titleFullText = false,
  onClose,
  children,
}: ResourceDetailPanelLayoutProps) => {
  const useBaseStyle = kind != null;
  const titleClass = titleFullText ? 'text-lg font-bold break-words' : 'text-lg font-bold truncate';

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        {/* Header row: title/kind on left; actions + close grouped on right */}
        <div style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            {useBaseStyle && KindIcon ? (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <KindIcon size={18} className="text-[var(--color-primary)] flex-shrink-0" />
                <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--color-muted)' }}>
                  {kind}
                </h2>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <h2 className={titleClass} style={{ color: 'var(--color-text)' }} title={titleFullText ? undefined : title}>
                  {title}
                </h2>
              </div>
            )}
            <div
              className="flex items-center flex-shrink-0 rounded-lg border overflow-hidden"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              {actions && (
                <div className="flex items-center">
                  {actions}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-r-md transition-all duration-150 hover:opacity-80 flex-shrink-0"
                style={{
                  color: 'var(--color-muted)',
                  backgroundColor: actions ? 'transparent' : 'transparent',
                  borderLeft: actions ? '1px solid var(--color-border)' : 'none',
                }}
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Summary block: name, namespace, status cards, quick info (base style) */}
          {(useBaseStyle || statusCards.length > 0 || quickInfo.length > 0) && (
            <div className="px-4 pb-3 space-y-3">
              {(useBaseStyle || statusCards.length > 0 || quickInfo.length > 0) && (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3
                        className={titleFullText ? 'text-lg font-bold break-words' : 'text-lg font-bold truncate'}
                        style={{ color: 'var(--color-text)' }}
                        title={titleFullText ? undefined : title}
                      >
                        {title}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        {keyInfo.find((k) => k.label === 'Namespace')?.value ?? ''}
                      </p>
                    </div>
                  </div>

                  {statusCards.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {statusCards.map((card, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-2 ${card.bgClass ?? ''}`}
                          style={{
                            border: '1px solid var(--color-border)',
                            backgroundColor: card.bgClass ? undefined : 'var(--color-bg)',
                          }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                              {card.label}
                            </span>
                          </div>
                          <div
                            className={`text-sm font-bold ${card.colorClass ?? ''}`}
                            style={card.colorClass ? undefined : { color: 'var(--color-text)' }}
                          >
                            {card.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {quickInfo.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {quickInfo.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 min-w-0">
                          {item.icon && (
                            <item.icon size={12} className="text-blue-400 flex-shrink-0" />
                          )}
                          <span style={{ color: 'var(--color-muted)' }}>{item.label}:</span>
                          <span className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!useBaseStyle && keyInfo.length > 0 && (
                <div className="flex items-center gap-3 text-xs pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  {keyInfo.map((item, idx) => (
                    <div key={idx} className="flex-1 min-w-0">
                      <p className="mb-1" style={{ color: 'var(--color-muted)' }}>{item.label}</p>
                      <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!useBaseStyle && keyInfo.length > 0 && statusCards.length === 0 && quickInfo.length === 0 && (
            <div className="px-4 pb-3 flex items-center gap-3 text-xs">
              {keyInfo.map((item, idx) => (
                <div key={idx} className="flex-1 min-w-0">
                  <p className="mb-1" style={{ color: 'var(--color-muted)' }}>{item.label}</p>
                  <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content: scrollable sections — base project style */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ color: 'var(--color-text)' }}>
          {children}
        </div>
      </div>
    </ResizablePanel>
  );
};

/** Collapsible section (base project style): uppercase header + chevron, divide-y rows when expanded */
export const CollapsibleSection = ({
  title,
  defaultExpanded = false,
  children,
  icon: Icon,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  icon?: LucideIcon;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center justify-between cursor-pointer hover:opacity-80 transition-colors"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-muted)',
          borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={12} />}
          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && (
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
};

/** Section card for detail panel — non-collapsible (base project static section style) */
export const DetailSection = ({
  title,
  children,
  collapsible,
  defaultExpanded = true,
  icon: Icon,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  icon?: LucideIcon;
}) => {
  if (collapsible) {
    return (
      <CollapsibleSection title={title} defaultExpanded={defaultExpanded} icon={Icon}>
        {children}
      </CollapsibleSection>
    );
  }
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-muted)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {Icon && <Icon size={12} className="inline mr-2" />}
        {title}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {children}
      </div>
    </div>
  );
};

/** Single key-value row inside a section — base project style (px-4 py-3, text-sm) */
export const DetailRow = ({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  icon?: LucideIcon;
}) => (
  <div
    className="px-4 py-3 flex items-center justify-between"
    style={{ borderColor: 'var(--color-border)' }}
  >
    <span className="text-sm flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
      {Icon && <Icon size={14} className="flex-shrink-0" />}
      {label}
    </span>
    <span
      className={`text-sm font-medium truncate max-w-[220px] text-right ${mono ? 'font-mono' : ''}`}
      style={{ color: 'var(--color-text)' }}
    >
      {value ?? '-'}
    </span>
  </div>
);

/** Expandable Labels section — base project style, default collapsed */
export const DetailLabelsSection = ({ labels }: { labels?: Record<string, string> | null }) => {
  const [expanded, setExpanded] = useState(false);
  const entries = labels && typeof labels === 'object' && !Array.isArray(labels) ? Object.entries(labels) : [];
  const count = entries.length;
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center justify-between cursor-pointer hover:opacity-80 transition-colors"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-muted)',
          borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider">Labels ({count})</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && (
        <div className="divide-y px-4" style={{ borderColor: 'var(--color-border)' }}>
          {count > 0 ? (
            entries.map(([key, value]) => (
              <div
                key={key}
                className="py-3 flex items-center justify-between gap-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="truncate" style={{ color: 'var(--color-muted)' }}>{key}</span>
                <span className="font-medium text-right break-all" style={{ color: 'var(--color-text)' }}>{value}</span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm" style={{ color: 'var(--color-muted)' }}>No labels</p>
          )}
        </div>
      )}
    </div>
  );
};

/** Expandable Annotations section — base project style, default collapsed */
export const DetailAnnotationsSection = ({ annotations }: { annotations?: Record<string, string> | null }) => {
  const [expanded, setExpanded] = useState(false);
  const entries = annotations && typeof annotations === 'object' && !Array.isArray(annotations) ? Object.entries(annotations) : [];
  const count = entries.length;
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center justify-between cursor-pointer hover:opacity-80 transition-colors"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-muted)',
          borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider">Annotations ({count})</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && (
        <div className="divide-y px-4" style={{ borderColor: 'var(--color-border)' }}>
          {count > 0 ? (
            entries.map(([key, value]) => (
              <div
                key={key}
                className="py-3 flex items-center justify-between gap-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="truncate" style={{ color: 'var(--color-muted)' }}>{key}</span>
                <span className="font-medium text-right break-all" style={{ color: 'var(--color-text)' }}>{value}</span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm" style={{ color: 'var(--color-muted)' }}>No annotations</p>
          )}
        </div>
      )}
    </div>
  );
};
