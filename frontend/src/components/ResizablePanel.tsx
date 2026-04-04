import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';

// ── ResizablePanel ────────────────────────────────────────────────────────────

interface ResizablePanelProps {
  children: ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: string;
}

export const ResizablePanel = ({
  children,
  minWidth = 320,
  maxWidth = 800,
  defaultWidth = '520px',
}: ResizablePanelProps) => {
  const [width, setWidth] = useState<string>(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const windowWidth = window.innerWidth;
      const newWidth = windowWidth - e.clientX;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(`${newWidth}px`);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  return (
    <>
      {/* Floating expand tab — anchored to right edge when panel is collapsed */}
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed top-1/2 right-0 z-[101] flex items-center justify-center w-5 h-20 rounded-l-md shadow-lg focus:outline-none"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          borderLeft: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          opacity: collapsed ? 1 : 0,
          pointerEvents: collapsed ? 'auto' : 'none',
          transform: collapsed
            ? 'translateY(-50%) translateX(0)'
            : 'translateY(-50%) translateX(100%)',
          transition: 'opacity 250ms ease, transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        title="Expand panel"
        aria-label="Expand detail panel"
        aria-hidden={!collapsed}
        tabIndex={collapsed ? 0 : -1}
      >
        <ChevronLeft size={12} />
      </button>

      <aside
        ref={panelRef}
        className="fixed top-0 right-0 z-[100] h-screen shadow-2xl group/panel"
        style={{
          width,
          backgroundColor: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          transform: collapsed ? 'translateX(100%)' : 'translateX(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
          onMouseDown={handleMouseDown}
          role="separator"
          aria-label="Resize panel"
        />

        {/* Collapse toggle — appears in the top-left gutter on panel hover */}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="absolute top-2.5 left-2 z-20 p-1 rounded opacity-0 group-hover/panel:opacity-100 hover:bg-hover transition-opacity focus:opacity-100 focus:outline-none"
          style={{ color: 'var(--color-text-secondary)' }}
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <ChevronRight size={14} />
        </button>

        {children}
      </aside>
    </>
  );
};
