import type { ReactNode } from 'react';

export type SourceKind =
  | 'sam_gov'
  | 'fpds'
  | 'usaspending'
  | 'govwin'
  | 'news'
  | 'doctrine'
  | 'partner_site'
  | 'internal';

export interface SourceRef {
  url: string;
  kind: SourceKind;
  label?: string;
}

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}

export interface IconButtonProps {
  icon: ReactNode;
  'aria-label': string;
  variant?: 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  onClick?: () => void;
}

export interface LinkProps {
  href: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
}

export interface TextFieldProps {
  type?: 'text' | 'search' | 'number';
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  disabled?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export interface TextareaProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  disabled?: boolean;
  rows?: number;
}

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  label?: string;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  indeterminate?: boolean;
}

export interface RadioGroupProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  name: string;
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export interface SliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label?: string;
  disabled?: boolean;
}

export interface CardProps {
  variant?: 'default' | 'banner';
  bannerSeverity?: 'info' | 'critical';
  clickable?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export interface AgentRecommendationCardProps {
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  sources: SourceRef[];
  reasoning?: string;
  onApprove: () => void;
  onReject: () => void;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface TableColumn<T> {
  key: string;
  header: string;
  width?: number | string;
  sortable?: boolean;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;
  stickyHeader?: boolean;
  rowKey: (row: T) => string;
}

export interface StatProps {
  label: string;
  value: string | number;
  sourceUrl: string;
  sourceKind?: SourceKind;
}

export interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  sourceUrl: string;
  sourceKind?: SourceKind;
  trend?: 'up' | 'down' | 'flat';
}

export interface FieldProps {
  label: string;
  value: string | number | ReactNode;
  sourceUrl: string;
  sourceKind?: SourceKind;
}

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}

export interface PopoverProps {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface SourceUrlChipProps {
  url: string;
  source_kind: SourceKind;
  retrieved_at: string;
  label?: string;
}

export interface TooltipProps {
  content: string | ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  children: ReactNode;
}

export interface ToastProps {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
  duration?: number;
}

export interface KeyboardShortcutHintProps {
  keys: string[];
  label?: string;
}

export interface CommandGroup {
  label: string;
  commands: Command[];
}

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  action: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandGroup[];
  onExecute: (command: Command) => void;
}

export interface InspectorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  defaultWidth?: number;
}

export interface AppShellProps {
  children: ReactNode;
}

export interface TopBarProps {
  children?: ReactNode;
}

export interface LeftRailProps {
  collapsed?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}

export interface MainCanvasProps {
  children: ReactNode;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  error?: Error;
}

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  lines?: number;
  variant?: 'text' | 'rect' | 'circle';
}

export interface SidebarNavItemProps {
  icon: ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number | undefined;
  collapsed?: boolean;
}

export interface StageIndicatorProps {
  stage: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  label?: string;
  showLabel?: boolean;
}

export interface ChipProps {
  label: string;
  variant?: 'default' | 'source' | 'confidence' | 'status';
  level?: 'high' | 'medium' | 'low';
  status?: 'qualified' | 'pursuing' | 'submitted' | 'won' | 'lost' | 'blocked';
  sourceUrl?: string;
  sourceKind?: SourceKind;
  onRemove?: () => void;
  onClick?: () => void;
}

export interface ListProps<T> {
  items: T[];
  activeId?: string;
  onActivate?: (item: T) => void;
  renderItem: (item: T, active: boolean) => ReactNode;
  itemKey: (item: T) => string;
  emptyState?: ReactNode;
}

/* Chart data contracts per D2 §7 */

export interface FundingVelocityData {
  periods: {
    label: string;
    currentFY: number;
    priorFY: number;
  }[];
  naicsFilter: string[];
  sourceRefs: SourceRef[];
}

export interface PipelineAgingData {
  items: {
    id: string;
    title: string;
    stage: number;
    daysInStage: number;
    threshold: number;
    value: number;
  }[];
  sourceRefs: SourceRef[];
}

export interface WinProbDistributionData {
  buckets: {
    range: string;
    rangeMin: number;
    rangeMax: number;
    items: {
      stage: number;
      count: number;
      totalValue: number;
    }[];
  }[];
  sourceRefs: SourceRef[];
}

export interface SourceKindContributionData {
  periods: {
    label: string;
    sources: {
      kind: SourceKind;
      count: number;
      qualified: number;
      value: number;
    }[];
  }[];
  sourceRefs: SourceRef[];
}

export interface CaptureStageData {
  stages: {
    stage: number;
    label: string;
    count: number;
    totalValue: number;
    conversionRate: number;
  }[];
  sourceRefs: SourceRef[];
}
