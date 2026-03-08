import { DrawerItem } from './DrawerItem';

export interface DrawerLabelsAnnotationsProps {
  labels?: Record<string, string> | null;
  annotations?: Record<string, string> | null;
}

/** Standard Labels and Annotations rows for resource detail panels (Freelens-style). */
export function DrawerLabelsAnnotations({ labels = {}, annotations = {} }: DrawerLabelsAnnotationsProps) {
  const labelsObj = labels && typeof labels === 'object' && !Array.isArray(labels) ? labels : {};
  const annotationsObj = annotations && typeof annotations === 'object' && !Array.isArray(annotations) ? annotations : {};
  const labelEntries = Object.entries(labelsObj);
  const annotationEntries = Object.entries(annotationsObj);

  return (
    <>
      <DrawerItem name="Labels" labelsOnly>
        {labelEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {labelEntries.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex px-2 py-0.5 rounded text-sm border border-border"
                style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}
                title={`${key}=${value}`}
              >
                {key}={value}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>No labels</span>
        )}
      </DrawerItem>
      <DrawerItem name="Annotations" labelsOnly>
        {annotationEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {annotationEntries.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex px-2 py-0.5 rounded text-sm border border-border break-all"
                style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}
                title={`${key}=${value}`}
              >
                {key}={value}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>No annotations</span>
        )}
      </DrawerItem>
    </>
  );
}
