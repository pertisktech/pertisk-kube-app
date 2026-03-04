import { forwardRef, useEffect, useRef, InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../utils';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const checkboxRef = (ref as any) || internalRef;

    useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = !!indeterminate;
      }
    }, [indeterminate, checkboxRef]);

    return (
      <label className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checked}
          className={cn('peer sr-only', className)}
          {...props}
        />
        <div
          className={cn(
            'w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-200',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/20 peer-focus-visible:ring-offset-1',
            checked || indeterminate
              ? 'bg-primary border-primary'
              : 'border-border bg-surface hover:border-primary/50'
          )}
        >
          {checked && !indeterminate && (
            <Check size={12} className="text-bg animate-in zoom-in-50 duration-200" strokeWidth={3} />
          )}
          {indeterminate && (
            <Minus size={12} className="text-bg animate-in zoom-in-50 duration-200" strokeWidth={3} />
          )}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
