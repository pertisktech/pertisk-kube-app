import { getStatusBgClass } from '../utils';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBgClass(status)}`}
    >
      {status}
    </span>
  );
};
