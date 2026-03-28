import { Loader } from './Icons';
import { cn } from '../utils';

interface LoadingStateProps {
  message?: string;
  size?: number;
  className?: string;
  textClassName?: string;
}

export const LoadingState = ({
  message = 'Loading...',
  size = 24,
  className,
  textClassName,
}: LoadingStateProps) => {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-2">
        <Loader size={size} className="text-primary animate-spin" />
        <p className={cn('text-sm text-text-secondary', textClassName)}>{message}</p>
      </div>
    </div>
  );
};
