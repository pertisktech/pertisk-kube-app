import { useState } from 'react';
import { ChevronDown } from '../Icons';
import { DrawerItem } from './DrawerItem';

export interface DrawerLabelsAnnotationsProps {
  labels?: Record<string, string> | null;
  annotations?: Record<string, string> | null;
}

/**
 * Labels and Annotations as expandable rows (Node panel style).
 * No Metadata section; each is a row with count and chevron, expand to see key-value list full width below.
 */
export function DrawerLabelsAnnotations({ labels = {}, annotations = {} }: DrawerLabelsAnnotationsProps) {
  const labelsObj = labels && typeof labels === 'object' && !Array.isArray(labels) ? labels : {};
  const annotationsObj = annotations && typeof annotations === 'object' && !Array.isArray(annotations) ? annotations : {};
  const labelEntries = Object.entries(labelsObj);
  const annotationEntries = Object.entries(annotationsObj);

  return (
    <>
      <DrawerExpandableKeyValues
        name="Labels"
        count={labelEntries.length}
        entries={labelEntries}
        emptyMessage="No labels"
      />
      <DrawerExpandableKeyValues
        name="Annotations"
        count={annotationEntries.length}
        entries={annotationEntries}
        emptyMessage="No annotations"
      />
    </>
  );
}

function DrawerExpandableKeyValues({
  name,
  count,
  entries,
  emptyMessage,
}: {
  name: string;
  count: number;
  entries: [string, string][];
  emptyMessage: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="DrawerExpandableKeyValues">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="DrawerItem grid gap-x-3 py-2 w-full text-left border-0 outline-none cursor-pointer hover:opacity-90 transition-opacity border-b last:border-b-0"
        style={{
          gridTemplateColumns: 'minmax(30%, min-content) 1fr',
          borderColor: 'var(--color-border)',
          backgroundColor: 'transparent',
          color: 'inherit',
        }}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
      >
        <span className="DrawerItem-name text-sm overflow-hidden text-ellipsis pr-2 min-w-0" style={{ color: 'var(--color-muted)' }}>
          {name} ({count})
        </span>
        <span className="DrawerItem-value flex items-center justify-end min-w-0" style={{ color: 'var(--color-primary)' }}>
          <ChevronDown size={14} color="var(--color-primary)" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="space-y-0 border-b border-border pt-2" style={{ borderColor: 'var(--color-border)' }}>
          {entries.length > 0 ? (
            entries.map(([key, value]) => (
              <DrawerItem key={key} name={key}>
                {value}
              </DrawerItem>
            ))
          ) : (
            <div className="py-2">
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{emptyMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
