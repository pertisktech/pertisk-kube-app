import { type ReactNode } from 'react';
import type { IconComponent } from './Icons';

export interface MetricTab<TId extends string> {
  id: TId;
  label: string;
  icon: IconComponent;
  color: string;
}

interface ResourceMetricsPanelProps<TTab extends string> {
  tabs: readonly MetricTab<TTab>[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
  children: ReactNode;
  isLoading?: boolean;
  error?: string | null;
}

export const ResourceMetricsPanel = <TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
  children,
  isLoading = false,
  error,
}: ResourceMetricsPanelProps<TTab>) => {
  const active = tabs.find((t) => t.id === activeTab);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
              style={isActive ? { borderBottomColor: tab.color } : undefined}
              className={`group relative flex flex-col items-center gap-1 px-3 pt-2.5 pb-2 border-b-2 transition-colors ${
                isActive
                  ? 'border-b-2 text-white'
                  : 'border-transparent text-text-secondary hover:text-text hover:bg-hover'
              }`}
            >
              <Icon size={15} color={isActive ? tab.color : undefined} />
              <span
                className="text-[9px] font-medium leading-none"
                style={isActive ? { color: tab.color } : undefined}
              >
                {tab.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
        {active && (
          <span className="ml-auto mr-3 text-xs text-text-secondary truncate hidden sm:block">
            {active.label}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {isLoading ? (
          <div className="h-52 flex items-center justify-center text-sm text-text-secondary">Loading…</div>
        ) : error ? (
          <div className="h-52 flex items-center justify-center text-sm text-red-400">{error}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
