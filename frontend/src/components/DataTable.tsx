import { ReactNode } from 'react';
import { Loader } from 'lucide-react';
import { cn } from '../utils';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  error?: string | null;
  rowKey: keyof T;
}

export const DataTable = <T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  error,
  rowKey,
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

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left font-semibold text-text"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={String(row[rowKey])}
                className={cn(
                  'border-b border-border',
                  rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-elevated'
                )}
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-4 py-3 text-text">
                    {typeof col.accessor === 'function'
                      ? col.accessor(row)
                      : String(row[col.accessor] || '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
