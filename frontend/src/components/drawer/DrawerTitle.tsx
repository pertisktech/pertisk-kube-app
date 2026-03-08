import type { ReactNode } from 'react';

export interface DrawerTitleProps {
  className?: string;
  children?: ReactNode;
  size?: 'sub-title' | 'title';
}

/**
 * Section title in drawer content. Same horizontal padding as content (none);
 * vertical padding matches DrawerItem (py-2) so PROPERTY aligns with rows.
 */
export function DrawerTitle({ className = '', children, size = 'title' }: DrawerTitleProps) {
  const isSub = size === 'sub-title';
  return (
    <div
      className={`DrawerTitle mt-6 first:mt-0 py-2 ${className}`.trim()}
      style={{
        backgroundColor: 'var(--color-surface-elevated, var(--color-bg))',
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {children}
      </span>
    </div>
  );
}
