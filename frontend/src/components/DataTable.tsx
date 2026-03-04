import { ReactNode } from 'react';
import { Loader } from 'lucide-react';
import { cn } from '../utils';
import { Checkbox } from './Checkbox';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: string;
  sortable?: boolean;
  sortKey?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  error?: string | null;
  rowKey: keyof T;
  onRowClick?: (row: T) => void;
  selectedRowKey?: string;
  sortState?: SortState;
  onSortChange?: (sort: SortState) => void;
  selectedRows?: string[];
  onRowSelectionChange?: (selectedKeys: string[]) => void;
  enableRowSelection?: boolean;
}

export const DataTable = <T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  error,
  rowKey,
  onRowClick,
  selectedRowKey,
  sortState,
  onSortChange,
  selectedRows = [],
  onRowSelectionChange,
  enableRowSelection = false,
}: DataTableProps<T>) => {
  if (error) {
    return (
      <div className="status-red border rounded-lg p-4">
        Error loading data: {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <Loader size={32} className="text-primary animate-spin" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-8 text-center">
        <p className="text-text-secondary">No data available</p>
      </div>
    );
  }

  const handleSelectAll = (checked: boolean) => {
    if (onRowSelectionChange) {
      if (checked) {
        const allKeys = data.map((row) => String(row[rowKey]));
        onRowSelectionChange(allKeys);
      } else {
        onRowSelectionChange([]);
      }
    }
  };

  const handleRowSelect = (rowKeyValue: string, checked: boolean) => {
    if (onRowSelectionChange) {
      if (checked) {
        onRowSelectionChange([...selectedRows, rowKeyValue]);
      } else {
        onRowSelectionChange(selectedRows.filter((key) => key !== rowKeyValue));
      }
    }
  };

  const allSelected = enableRowSelection && data.length > 0 && selectedRows.length === data.length;
  const someSelected = enableRowSelection && selectedRows.length > 0 && selectedRows.length < data.length;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              {enableRowSelection && (
                <th className="w-8 pl-2 pr-0 py-2 text-left">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
              )}
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 text-left font-semibold text-text"
                  style={{ width: col.width }}
                >
                  {col.sortable && col.sortKey && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => {
                        const currentKey = col.sortKey!;
                        const nextDirection: SortDirection =
                          sortState?.key === currentKey && sortState?.direction === 'asc'
                            ? 'desc'
                            : 'asc';
                        onSortChange({ key: currentKey, direction: nextDirection });
                      }}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <span>{col.header}</span>
                      <span className="text-xs text-text-secondary">
                        {sortState?.key === col.sortKey
                          ? sortState.direction === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => {
              const rowKeyValue = String(row[rowKey]);
              const isSelected = selectedRows.includes(rowKeyValue);

              return (
                <tr
                  key={rowKeyValue}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border',
                    rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-elevated',
                    onRowClick && 'cursor-pointer hover:bg-hover',
                    selectedRowKey === rowKeyValue && 'bg-hover',
                    isSelected && 'bg-hover'
                  )}
                >
                  {enableRowSelection && (
                    <td className="w-8 pl-2 pr-0 py-2">
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => handleRowSelect(rowKeyValue, e.target.checked)}
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={cn('px-3 py-2', colIdx === 0 ? 'text-primary font-medium' : 'text-text')}>
                      {(() => {
                        const cellValue =
                          typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : row[col.accessor] != null ? String(row[col.accessor]) : '-';

                        if (col.header === 'Age') {
                          return <span className="whitespace-nowrap">{cellValue}</span>;
                        }

                        return cellValue;
                      })()}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
