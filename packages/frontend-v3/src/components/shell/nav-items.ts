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
  ClipboardCheck,
  Newspaper,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Launchpad", href: "/launchpad", icon: Rocket },
  { label: "Daily Brief", href: "/briefing", icon: Newspaper },
  { label: "Fast Track", href: "/fast-track", icon: Zap },
  { label: "Opportunities", href: "/opportunities", icon: Search },
  { label: "Capture", href: "/capture", icon: Target },
  { label: "Pipeline", href: "/pipeline", icon: BarChart3 },
  { label: "Awards & Intel", href: "/awards", icon: Trophy },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck },
  { label: "Financial Bible", href: "/financials", icon: BookOpen },
  { label: "Action Items", href: "/action-items", icon: CheckSquare },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Competitors", href: "/competitors", icon: Shield },
  { label: "Risks", href: "/risks", icon: AlertTriangle },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

export const PROMPT_CREATOR_ITEM: NavItem = {
  label: "Prompt Creator",
  href: "/prompt-creator",
  icon: Terminal,
};
