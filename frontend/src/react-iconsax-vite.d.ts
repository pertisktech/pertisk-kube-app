declare module 'react-iconsax-vite' {
  import type { FC } from 'react';
  export const VsxIcon: FC<{
    iconName: string;
    size?: number | string;
    color?: string;
    type?: 'linear' | 'outline' | 'bold' | 'bulk' | 'broken' | 'twotone';
    className?: string;
  }>;
}
