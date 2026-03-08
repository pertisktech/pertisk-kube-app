import type { ReactNode } from 'react';

export interface DrawerTitleProps {
  className?: string;
  children?: ReactNode;
  size?: 'sub-title' | 'title';
}

/**
 * Freelens-style section title in drawer content.
 * Full-bleed background bar; use for "Connection", "Conditions", etc.
 */
export function DrawerTitle({ className = '', children, size = 'title' }: DrawerTitleProps) {
  const isSub = size === 'sub-title';
  return (
    <div
      className={`DrawerTitle mt-6 first:mt-0 ${isSub ? 'py-2 px-4' : 'py-3 px-4'} ${className}`.trim()}
      style={{
        marginLeft: 'calc(-1 * var(--drawer-content-spacing, 1.5rem))',
        marginRight: 'calc(-1 * var(--drawer-content-spacing, 1.5rem))',
        paddingLeft: 'var(--drawer-content-spacing, 1.5rem)',
        paddingRight: 'var(--drawer-content-spacing, 1.5rem)',
        backgroundColor: 'var(--color-surface-elevated, var(--color-bg))',
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {children}
      </span>
    </div>
  );
}
