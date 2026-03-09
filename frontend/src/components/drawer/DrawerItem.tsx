import type { ReactNode } from 'react';

export interface DrawerItemProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: ReactNode;
  title?: string;
  labelsOnly?: boolean;
  hidden?: boolean;
  children?: ReactNode;
}

/**
 * Freelens-style drawer row: name (left) + value (right).
 * Used in node/resource detail panels for consistent layout.
 */
export function DrawerItem({
  name,
  title,
  labelsOnly = false,
  children,
  hidden = false,
  className = '',
  ...rest
}: DrawerItemProps) {
  if (hidden) {
    return null;
  }

  return (
    <div
      {...rest}
      className={`DrawerItem grid gap-x-3 py-2 border-b last:border-b-0 ${labelsOnly ? 'labelsOnly' : ''} ${name ? '' : 'WithoutName'} ${className}`.trim()}
      style={{
        gridTemplateColumns: name ? 'minmax(30%, min-content) 1fr' : undefined,
        borderColor: 'var(--color-border)',
      }}
      title={title}
    >
      {name != null && (
        <span className="DrawerItem-name text-sm overflow-hidden text-ellipsis pr-2" style={{ color: 'var(--color-muted)' }}>
          {name}
        </span>
      )}
      <span className="DrawerItem-value min-w-0 text-sm break-words text-right" style={{ color: 'var(--color-text)' }}>
        {children ?? '—'}
      </span>
    </div>
  );
}
