import { ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export const Card = ({ title, children, className = '' }: CardProps) => {
  return (
    <div className={`bg-surface border border-border rounded-lg p-6 ${className}`}>
      <h2 className="text-lg font-semibold text-text mb-4">{title}</h2>
      {children}
    </div>
  );
};

interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
}

export const Stat = ({ label, value, unit }: StatProps) => {
  return (
    <div className="flex flex-col gap-1 p-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-2xl font-bold text-primary">
        {value}{unit && <span className="text-lg text-text-secondary ml-1">{unit}</span>}
      </span>
    </div>
  );
};
