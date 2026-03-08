import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '../Icons';

export interface DrawerCollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible section in drawer content (e.g. Metadata / Labels & Annotations).
 * Uses same grid as DrawerItem so the chevron aligns with row toggles (e.g. Tolerations).
 */
export function DrawerCollapsibleSection({
  title,
  defaultExpanded = false,
  children,
  className = '',
}: DrawerCollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`DrawerCollapsibleSection mt-6 first:mt-0 ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="DrawerItem grid gap-x-3 py-2 w-full text-left border-0 outline-none cursor-pointer hover:opacity-90 transition-opacity border-b last:border-b-0"
        style={{
          gridTemplateColumns: 'minmax(30%, min-content) 1fr',
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface-elevated, var(--color-bg))',
          color: 'var(--color-muted)',
        }}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <span className="DrawerItem-name text-xs font-semibold uppercase tracking-wide overflow-hidden text-ellipsis pr-2 min-w-0" style={{ color: 'var(--color-muted)' }}>
          {title}
        </span>
        <span className="DrawerItem-value flex items-center justify-end min-w-0" style={{ color: 'var(--color-primary)' }}>
          {expanded ? <ChevronUp size={14} color="var(--color-primary)" /> : <ChevronDown size={14} color="var(--color-primary)" />}
        </span>
      </button>
      {expanded && <div className="pt-1">{children}</div>}
    </div>
  );
}
