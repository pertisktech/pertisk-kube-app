import type { ReactNode } from 'react';

export interface DrawerTitleProps {
  className?: string;
  children?: ReactNode;
  size?: 'sub-title' | 'title';
}

/**
 * Freelens-style section title in drawer content.
 * Use for "Capacity", "Allocatable", etc.
 */
export function DrawerTitle({ className = '', children, size = 'title' }: DrawerTitleProps) {
  const isSub = size === 'sub-title';
  return (
    <div
      className={`DrawerTitle mt-4 -mx-4 first:mt-0 ${isSub ? 'py-2 px-4' : 'py-3 px-4'} ${className}`.trim()}
      style={{ backgroundColor: 'var(--color-surface-elevated)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {children}
      </span>
    </div>
  );
}
