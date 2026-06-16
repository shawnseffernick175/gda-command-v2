import {
  Rocket,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Launchpad", href: "/launchpad", icon: Rocket },
  { label: "Digest", href: "/digest", icon: Radio },
  { label: "Fast Track", href: "/fast-track", icon: Zap },
  { label: "Opportunities", href: "/opportunities", icon: Search },
  { label: "Vehicles", href: "/vehicles", icon: Layers },
  { label: "Capture", href: "/capture", icon: Target },
  { label: "Pipeline", href: "/pipeline", icon: BarChart3 },
  { label: "Awards & Intel", href: "/awards", icon: Trophy },
  { label: "Financial Bible", href: "/financials", icon: BookOpen },
  { label: "Action Items", href: "/action-items", icon: CheckSquare },
  { label: "Vault", href: "/vault", icon: Archive },
  { label: "Overrides", href: "/overrides", icon: GitCompare },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Competitors", href: "/competitors", icon: Shield },
  { label: "Risks", href: "/risks", icon: AlertTriangle },
  { label: "Prompts", href: "/prompts", icon: Terminal },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

