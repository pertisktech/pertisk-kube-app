/**
 * Central icon exports using react-iconsax-vite (Iconsax).
 * Wraps VsxIcon with a Lucide-compatible API (size, className, color).
 * Icons without an Iconsax mapping are re-exported from lucide-react.
 * @see https://react-iconsax-vite-preview.vercel.app/
 */

import React from 'react';
import { VsxIcon } from 'react-iconsax-vite';
import * as Lucide from 'lucide-react';

/** Accepts any icon-like component (Iconsax wrappers or Lucide re-exports). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = React.ComponentType<any>;

type VsxProps = {
  size?: number;
  className?: string;
  color?: string;
  type?: 'linear' | 'outline' | 'bold' | 'bulk' | 'broken' | 'twotone';
  strokeWidth?: number;
  [key: string]: unknown;
};

function icon(iconName: string) {
  return function VsxIconWrapper({ size = 24, className, color = 'currentColor', type = 'linear', strokeWidth: _ }: VsxProps) {
    return (
      <VsxIcon
        iconName={iconName}
        size={size}
        color={color}
        type={type}
        className={className}
      />
    );
  };
}

// ——— Iconsax (react-iconsax-vite) ———
export const Trash2 = icon('Trash');
export const Pencil = icon('Edit2');
export const X = icon('CloseCircle');
export const Loader = icon('Refresh');
export const ChevronDown = icon('ArrowDown2');
export const ChevronUp = icon('ArrowUp2');
export const ChevronRight = icon('ArrowRight3');
export const ChevronLeft = icon('ArrowLeft3');
export const ArrowUp = icon('ArrowUp');
export const ArrowDown = icon('ArrowDown');
export const ArrowUpDown = icon('Sort');
export const CheckCircle = icon('TickCircle');
export const XCircle = icon('Danger');
export const AlertCircle = icon('Warning2');
export const AlertTriangle = icon('Warning2');
export const Layers = icon('Layer');
export const Clock = icon('Clock');
export const RotateCcw = icon('RotateLeft');
export const Eye = icon('Eye');
export const EyeOff = icon('EyeSlash');
export const Upload = icon('Import');
export const Moon = icon('Moon');
export const Sun = icon('Sun');
export const Shield = icon('Shield');
export const Star = icon('Star');
export const ExternalLink = icon('Export');
export const FileText = icon('DocumentText');
export const Lock = icon('Lock');
export const Unlock = icon('Unlock');
export const Terminal = icon('Code');
export const ScrollText = icon('DocumentText');
export const Cable = icon('Link');
export const LayoutGrid = icon('Grid3');
export const Menu = icon('HambergerMenu');
export const Maximize2 = icon('Maximize2');
export const Minimize2 = icon('Minimize2');
export const RefreshCw = icon('Refresh');
export const Box = icon('Box');
export const Database = icon('Box');
export const HardDrive = icon('Data');
export const Monitor = icon('Monitor');
export const Cpu = icon('Cpu');
export const Archive = icon('Archive');
export const Copy = icon('Copy');
export const RotateCw = icon('RotateRight');
export const Boxes = icon('Box1');
export const Settings = icon('Setting');
export const Globe = icon('Global');
export const KeyRound = icon('Key');
export const Gauge = icon('Activity');
export const Flag = icon('Flag');
export const Timer = icon('Timer');
export const SlidersHorizontal = icon('SliderHorizontal');
export const Bell = icon('Notification');
export const LayoutDashboard = icon('Monitor');
export const Network = icon('Routing2');
export const Server = icon('Monitor');
export const Plus = icon('Add');
export const TrendingUp = icon('TrendUp');
export const Check = icon('Check');
export const Minus = icon('Minus');

// ——— Lucide re-exports (no Iconsax equivalent or keep for compatibility) ———
export const Droplet = Lucide.Droplet;
export const Circle = Lucide.Circle;
export const Briefcase = Lucide.Briefcase;
export const FileCode = Lucide.FileCode;
export const Square = Lucide.Square;
export const Dot = Lucide.Dot;
