import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '../Icons';

export interface DrawerParamTogglerProps {
  label: string | number | ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Freelens-style toggler: shows label + "Show" / "Hide" link, content when open.
 */
export function DrawerParamToggler({ label, children, className = '' }: DrawerParamTogglerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`DrawerParamToggler flex flex-col gap-1 ${className}`.trim()}>
      <div className="flex items-center gap-2">
        <span className="param-label flex-1 text-xs" style={{ color: 'var(--color-muted)' }}>{label}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="param-link flex items-center cursor-pointer border-0 bg-transparent p-0"
          style={{ color: 'var(--color-primary)' }}
          aria-label={open ? 'Hide' : 'Show'}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && <div className="param-content pt-1">{children}</div>}
    </div>
  );
}
