import React from 'react';
import {
  AdjustmentsHorizontalIcon,
  ArchiveBoxIcon,
  ArrowLongDownIcon,
  ArrowLongUpIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowTrendingUpIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  Bars3Icon,
  BellIcon,
  BriefcaseIcon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleStackIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  CodeBracketSquareIcon,
  CpuChipIcon,
  CubeIcon,
  CubeTransparentIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  FolderIcon,
  GlobeAltIcon,
  KeyIcon,
  LinkIcon,
  LockClosedIcon,
  LockOpenIcon,
  MinusIcon,
  MoonIcon,
  PauseIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  ServerStackIcon,
  ShareIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  StarIcon,
  SunIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import * as Lucide from 'lucide-react';

export type IconComponent = React.ComponentType<any>;

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

function icon(Component: React.ComponentType<React.SVGProps<SVGSVGElement>>) {
  return function HeroIconWrapper({ size = 24, className, color = 'currentColor', style, ...props }: IconProps) {
    return (
      <Component
        width={size}
        height={size}
        className={className}
        style={{ color, ...style }}
        {...props}
      />
    );
  };
}

export const Trash2 = icon(TrashIcon);
export const Pencil = icon(PencilSquareIcon);
export const X = icon(XMarkIcon);
export const Loader = icon(ArrowPathIcon);
export const ChevronDown = icon(ChevronDownIcon);
export const ChevronUp = icon(ChevronUpIcon);
export const ChevronRight = icon(ChevronRightIcon);
export const ChevronLeft = icon(ChevronLeftIcon);
export const ArrowUp = icon(ArrowLongUpIcon);
export const ArrowDown = icon(ArrowLongDownIcon);
export const ArrowUpDown = icon(ArrowsUpDownIcon);
export const CheckCircle = icon(CheckCircleIcon);
export const XCircle = icon(XCircleIcon);
export const AlertCircle = icon(ExclamationCircleIcon);
export const AlertTriangle = icon(ExclamationTriangleIcon);
export const Layers = icon(Squares2X2Icon);
export const Clock = icon(ClockIcon);
export const RotateCcw = icon(ArrowUturnLeftIcon);
export const Eye = icon(EyeIcon);
export const EyeOff = icon(EyeSlashIcon);
export const Upload = icon(ArrowUpTrayIcon);
export const Moon = icon(MoonIcon);
export const Sun = icon(SunIcon);
export const Shield = icon(ShieldCheckIcon);
export const Star = icon(StarIcon);
export const ExternalLink = icon(ArrowTopRightOnSquareIcon);
export const FileText = icon(DocumentTextIcon);
export const Folder = icon(FolderIcon);
export const Lock = icon(LockClosedIcon);
export const Unlock = icon(LockOpenIcon);
export const Terminal = icon(CommandLineIcon);
export const ScrollText = icon(DocumentTextIcon);
export const Cable = icon(LinkIcon);
export const LayoutGrid = icon(Squares2X2Icon);
export const Menu = icon(Bars3Icon);
export const Maximize2 = icon(ArrowsPointingOutIcon);
export const Minimize2 = icon(ArrowsPointingInIcon);
export const RefreshCw = icon(ArrowPathIcon);
export const Box = icon(CubeIcon);
export const Database = icon(CircleStackIcon);
export const HardDrive = icon(ServerStackIcon);
export const Monitor = icon(ComputerDesktopIcon);
export const Cpu = icon(CpuChipIcon);
export const Archive = icon(ArchiveBoxIcon);
export const Copy = icon(DocumentDuplicateIcon);
export const RotateCw = icon(ArrowPathIcon);
export const Boxes = icon(CubeTransparentIcon);
export const Settings = icon(Cog6ToothIcon);
export const Globe = icon(GlobeAltIcon);
export const KeyRound = icon(KeyIcon);
export const Gauge = icon(ChartBarSquareIcon);
export const Flag = icon(FlagIcon);
export const Timer = Lucide.Timer;
export const SlidersHorizontal = icon(AdjustmentsHorizontalIcon);
export const Bell = icon(BellIcon);
export const LayoutDashboard = icon(Squares2X2Icon);
export const Network = icon(ArrowsRightLeftIcon);
export const Server = icon(ServerStackIcon);
export const Plus = icon(PlusIcon);
export const TrendingUp = icon(ArrowTrendingUpIcon);
export const Check = icon(CheckIcon);
export const Minus = icon(MinusIcon);
export const HelpCircle = Lucide.CircleHelp;

export const Droplet = Lucide.Droplet;
export const Circle = Lucide.Circle;
export const Briefcase = icon(BriefcaseIcon);
export const FileCode = icon(CodeBracketSquareIcon);
export const Square = Lucide.Square;
export const Dot = Lucide.Dot;
export const Share2 = icon(ShareIcon);
export const Pause = icon(PauseIcon);
export const Play = icon(PlayIcon);
