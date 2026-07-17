import {
  Zap,
  Search,
  Target,
  BarChart3,
  Trophy,
  BookOpen,
  CheckSquare,
  Users,
  Shield,
  AlertTriangle,
  Settings,
  Terminal,
  Archive,
  Radio,
  Layers,
  GitCompare,
  Activity,
  FileText,
  Hammer,
  SlidersHorizontal,
  FolderKanban,
  Palette,
  Crosshair,
  Handshake,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const PINNED_ITEMS: NavItem[] = [
  { label: "Launchpad", href: "/launchpad", icon: Rocket },
  { label: "Opportunities", href: "/opportunities", icon: Search },
  { label: "Pipeline", href: "/pipeline", icon: BarChart3 },
  { label: "Financial Bible", href: "/financials", icon: BookOpen },
  { label: "Prompts", href: "/prompts", icon: Terminal },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

export const SETTINGS_SUB_ITEMS: NavItem[] = [
  { label: "Scoring & Doctrine", href: "/settings/scoring-doctrine", icon: SlidersHorizontal },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pursuit",
    items: [
      { label: "FasTrac", href: "/fastrac", icon: Zap },
      { label: "Capture", href: "/capture", icon: Target },
      { label: "Color Team", href: "/color-teams", icon: Palette },
      { label: "Workshop", href: "/workshop", icon: Hammer },
    ],
  },
  {
    label: "Intel",
    items: [
      { label: "Awards & Intel", href: "/awards", icon: Trophy },
      { label: "Competitors", href: "/competitors", icon: Shield },
      { label: "Partners", href: "/partners", icon: Handshake },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Capabilities", href: "/capabilities", icon: Crosshair },
      { label: "Regulatory", href: "/regulatory", icon: FileText },
    ],
  },
  {
    label: "Execute",
    items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "IDIQ Ops", href: "/idiq-ops", icon: Activity },
      { label: "Vehicles", href: "/vehicles", icon: Layers },
      { label: "Action Items", href: "/action-items", icon: CheckSquare },
      { label: "Risks", href: "/risks", icon: AlertTriangle },
    ],
  },
  {
    label: "Knowledge & System",
    items: [
      { label: "Vault", href: "/vault", icon: Archive },
      { label: "Digest", href: "/digest", icon: Radio },
      { label: "Sentinel", href: "/sentinel", icon: Activity },
      { label: "Overrides", href: "/overrides", icon: GitCompare },
      SETTINGS_ITEM,
    ],
  },
];

// Flat list of every nav destination (pinned + all grouped items, including
// Settings). Consumers that need a single lookup table (command palette,
// route-label helpers) use this.
export const NAV_ITEMS: NavItem[] = [
  ...PINNED_ITEMS,
  ...NAV_GROUPS.flatMap((group) => group.items),
];
