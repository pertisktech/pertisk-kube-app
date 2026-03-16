import { type ReactNode } from 'react';

interface ResourceMetricsPanelProps<TTab extends string> {
  title: string;
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
  children: ReactNode;
  isLoading?: boolean;
  error?: string | null;
}

export const ResourceMetricsPanel = <TTab extends string>({
  title,
  tabs,
  activeTab,
  onTabChange,
  children,
  isLoading = false,
  error,
}: ResourceMetricsPanelProps<TTab>) => {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">{title}</h2>

        <div className="inline-flex items-center gap-1 rounded-lg bg-bg border border-border p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text hover:bg-hover'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-sm text-text-secondary">Loading...</div>
      ) : error ? (
        <div className="h-64 flex items-center justify-center text-sm text-red-400">{error}</div>
      ) : (
        children
      )}
    </div>
  );
};
