import { PanelCloseButton } from './ResourceDetailPanelLayout';
import type { ReactNode } from 'react';

interface DetailPanelHeaderProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  subtitle?: string | ReactNode;
}

export const DetailPanelHeader = ({
  title,
  onClose,
  children,
  subtitle,
}: DetailPanelHeaderProps) => {
  return (
    <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text truncate">{title}</h2>
          {subtitle && (
            <div className="mt-2 text-sm text-text-secondary">
              {subtitle}
            </div>
          )}
        </div>
        <PanelCloseButton onClick={onClose} label="Close panel" />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};
