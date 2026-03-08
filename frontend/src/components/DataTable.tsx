import { ReactNode } from 'react';
import { Loader, ArrowUp, ArrowDown, ArrowUpDown } from './Icons';
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
  rowKey: keyof T | ((row: T) => string);
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
  const getRowKeyValue = (row: T) =>
    typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]);

  if (error) {
    return (
      <div className="status-red border rounded-lg p-4">
        Error loading data: {error}
      </div>
    );
  }

  const handleSelectAll = (checked: boolean) => {
    if (onRowSelectionChange) {
      if (checked) {
        const allKeys = data.map((row) => getRowKeyValue(row));
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
    <div className="bg-surface border border-border rounded-lg overflow-hidden text-base">
      <div className="px-3 py-2 border-b border-border bg-surface-elevated text-base text-text-secondary">
        Total: {data.length} records
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 text-left text-base font-semibold text-text align-middle"
                  style={{ width: col.width }}
                >
                  {enableRowSelection && idx === 0 ? (
                    <div className="flex items-center gap-2">
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                      </span>
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
                          {sortState?.key === col.sortKey ? (
                            sortState.direction === 'asc' ? (
                              <ArrowUp size={14} className="text-primary" />
                            ) : (
                              <ArrowDown size={14} className="text-primary" />
                            )
                          ) : (
                            <ArrowUpDown size={14} className="text-text-secondary" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </div>
                  ) : col.sortable && col.sortKey && onSortChange ? (
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
                      {sortState?.key === col.sortKey ? (
                        sortState.direction === 'asc' ? (
                          <ArrowUp size={14} className="text-primary" />
                        ) : (
                          <ArrowDown size={14} className="text-primary" />
                        )
                      ) : (
                        <ArrowUpDown size={14} className="text-text-secondary" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-base">
                  <div className="flex flex-col items-center gap-2">
                    <Loader size={32} className="text-primary animate-spin" />
                    <p className="text-text-secondary">Loading...</p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-base text-text-secondary">
                  No data available
                </td>
              </tr>
            ) : (
            data.map((row, rowIdx) => {
              const rowKeyValue = getRowKeyValue(row);
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
                  {columns.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className={cn(
                        'px-3 py-2 align-middle text-base',
                        col.header === 'Name' && typeof col.accessor !== 'function'
                          ? 'text-text font-medium'
                          : 'text-text'
                      )}
                    >
                      {(() => {
                        const cellValue =
                          typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : row[col.accessor] != null
                              ? String(row[col.accessor])
                              : '-';

                        const content = col.header === 'Age'
                          ? <span className="whitespace-nowrap">{cellValue}</span>
                          : cellValue;

                        if (enableRowSelection && colIdx === 0) {
                          return (
                            <div className="flex items-center gap-2">
                              <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleRowSelect(rowKeyValue, e.target.checked)}
                                />
                              </span>
                              {content}
                            </div>
                          );
                        }

                        return content;
                      })()}
                    </td>
                  ))}
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
