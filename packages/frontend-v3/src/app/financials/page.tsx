"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { StatusStrip } from "@/components/financials/StatusStrip";
import { AiAnalyzeModal } from "@/components/financials/AiAnalyzeModal";
import { ContractWaterfallTab } from "@/components/financials/tabs/ContractWaterfallTab";
import { AopPlanTab } from "@/components/financials/tabs/AopPlanTab";
import { AopExecutionTab } from "@/components/financials/tabs/AopExecutionTab";
import { P2FinancialsTab } from "@/components/financials/tabs/P2FinancialsTab";
import { DefinitionsTab } from "@/components/financials/tabs/DefinitionsTab";
import { BalanceSheetCard } from "@/components/financials/BalanceSheetCard";
import { ApTab } from "@/components/financials/tabs/ApTab";
import { ArTab } from "@/components/financials/tabs/ArTab";
import { TrialBalanceTab } from "@/components/financials/tabs/TrialBalanceTab";
import { ProjectRevenueTab } from "@/components/financials/tabs/ProjectRevenueTab";
import { IngestionCoverageTab } from "@/components/financials/tabs/IngestionCoverageTab";
import { FinancialBibleTab } from "@/components/financials/tabs/FinancialBibleTab";
import {
  useAiAnalyze,
  useP2Financials,
} from "@/hooks/use-financial-bible";
import { cn } from "@/lib/utils";
import type { CalendarMode } from "@/lib/types";

type Tab =
  | "waterfall"
  | "plan"
  | "execution"
  | "p2"
  | "balance-sheet"
  | "ap"
  | "ar"
  | "trial-balance"
  | "project-revenue"
  | "ingestion-coverage"
  | "definitions"
  | "financial-bible";

interface TabGroup {
  label: string;
  tabs: { id: Tab; label: string }[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: "Statements",
    tabs: [
      { id: "p2", label: "Income Statement" },
      { id: "balance-sheet", label: "Balance Sheet" },
      { id: "trial-balance", label: "Trial Balance" },
    ],
  },
  {
    label: "Receivables & Payables",
    tabs: [
      { id: "ar", label: "Accounts Receivable" },
      { id: "ap", label: "Accounts Payable" },
    ],
  },
  {
    label: "Planning",
    tabs: [
      { id: "plan", label: "AOP Plan" },
      { id: "execution", label: "AOP Execution" },
    ],
  },
  {
    label: "Contracts",
    tabs: [
      { id: "waterfall", label: "Contract Waterfall" },
      { id: "project-revenue", label: "Project Revenue" },
    ],
  },
  {
    label: "Pricing",
    tabs: [
      { id: "financial-bible", label: "Financial Bible" },
    ],
  },
  {
    label: "Reference",
    tabs: [
      { id: "definitions", label: "Definitions" },
      { id: "ingestion-coverage", label: "Ingestion Coverage" },
    ],
  },
];

const YEAR_AWARE_TABS: ReadonlySet<Tab> = new Set([
  "plan",
  "execution",
]);

const CALENDAR_MODE_KEY = "gda-financial-bible-calendar-mode";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getCalendarSnapshot(): CalendarMode {
  const stored = localStorage.getItem(CALENDAR_MODE_KEY);
  return stored === "CY" ? "CY" : "FY";
}

function getCalendarServerSnapshot(): CalendarMode {
  return "FY";
}

const YEARS = ["26", "27", "28"] as const;

function tabTitle(tab: Tab): string {
  switch (tab) {
    case "waterfall":
      return "Contract Waterfall";
    case "plan":
      return "AOP Plan";
    case "execution":
      return "AOP Execution";
    case "p2":
      return "Income Statement";
    case "balance-sheet":
      return "Balance Sheet";
    case "ap":
      return "Accounts Payable";
    case "ar":
      return "Accounts Receivable";
    case "trial-balance":
      return "Trial Balance";
    case "project-revenue":
      return "Project Revenue";
    case "ingestion-coverage":
      return "Ingestion Coverage";
    case "definitions":
      return "Definitions";
    case "financial-bible":
      return "Financial Bible";
    default:
      return String(tab);
  }
}

export default function FinancialsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("p2");
  const calendarMode = useSyncExternalStore(
    subscribeToStorage,
    getCalendarSnapshot,
    getCalendarServerSnapshot,
  );

  const setCalendarMode = useCallback((mode: CalendarMode) => {
    localStorage.setItem(CALENDAR_MODE_KEY, mode);
    window.dispatchEvent(new StorageEvent("storage", { key: CALENDAR_MODE_KEY }));
  }, []);
  const [selectedYear, setSelectedYear] = useState<string>("26");
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const aiAnalyze = useAiAnalyze();
  const p2Data = useP2Financials();

  const fy = `${calendarMode}${selectedYear}`;
  const yearControlsActive = YEAR_AWARE_TABS.has(activeTab);

  const handleAiAnalyze = useCallback(() => {
    const kpi = p2Data.data?.kpi;
    const costPools = p2Data.data?.cost_by_pool ?? [];

    aiAnalyze.mutate({
      ytd_revenue: kpi?.ytd_revenue,
      ytd_expenses: kpi?.ytd_expenses,
      ytd_profit: kpi?.ytd_profit,
      margin: kpi?.ytd_margin,
      contracts: costPools.map((c) => ({
        name: c.pool,
        revenue: null,
        cost: c.actual,
        profit: null,
        margin: null,
      })),
    });

    setAiModalOpen(true);
  }, [p2Data.data, aiAnalyze]);

  return (
    <div className="space-y-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-3 sticky-page-header">
        {/* Page title + subtitle */}
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="shrink-0 text-lg font-semibold text-foreground">
              {tabTitle(activeTab)}
              {yearControlsActive ? ` \u2014 ${fy}` : ""}
            </h1>
            <p className="text-[12px] text-muted-foreground truncate">
              Envision Innovative Solutions {"\u2014"} Financial Bible
            </p>
          </div>

          {/* Right: AI Analyze + FY/CY toggle + year buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              className="rounded px-3 py-1.5 text-[13px] font-medium text-white transition-colors bg-fin-navy hover:bg-fin-navy-hover"
              onClick={handleAiAnalyze}
            >
              AI Analyze
            </button>

            {yearControlsActive && (
            <div className="flex items-center gap-2">
              <div className="flex rounded border border-border">
                {(["FY", "CY"] as CalendarMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={!yearControlsActive}
                    className={cn(
                      "px-2 py-1 text-[12px] font-medium transition-colors",
                      calendarMode === mode
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                      !yearControlsActive && "cursor-not-allowed",
                    )}
                    onClick={() => setCalendarMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {YEARS.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    disabled={!yearControlsActive}
                    className={cn(
                      "rounded px-2 py-1 text-[12px] font-medium transition-colors",
                      selectedYear === yr
                        ? "bg-card text-foreground border border-border"
                        : "text-muted-foreground hover:text-foreground",
                      !yearControlsActive && "cursor-not-allowed",
                    )}
                    onClick={() => setSelectedYear(yr)}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Status Strip */}
        <StatusStrip />

        {/* Tab bar — grouped tabs with visible group labels */}
        <nav className="flex flex-wrap items-start gap-x-5 gap-y-1">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium select-none">
                {group.label}
              </span>
              <div className="flex items-center gap-0.5">
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "border-b-2 px-2 pb-1 text-[13px] font-medium transition-colors",
                      activeTab === tab.id
                        ? "border-gda-cyan text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === "waterfall" && <ContractWaterfallTab />}
        {activeTab === "plan" && <AopPlanTab fy={fy} />}
        {activeTab === "execution" && <AopExecutionTab fy={fy} />}
        {activeTab === "p2" && <P2FinancialsTab />}
        {activeTab === "balance-sheet" && <BalanceSheetCard />}
        {activeTab === "ap" && <ApTab />}
        {activeTab === "ar" && <ArTab />}
        {activeTab === "trial-balance" && <TrialBalanceTab />}
        {activeTab === "project-revenue" && <ProjectRevenueTab />}
        {activeTab === "ingestion-coverage" && <IngestionCoverageTab />}
        {activeTab === "definitions" && <DefinitionsTab />}
        {activeTab === "financial-bible" && <FinancialBibleTab />}
      </div>

      {/* AI Analyze Modal */}
      <AiAnalyzeModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        analysis={aiAnalyze.data?.analysis ?? null}
        generatedAt={aiAnalyze.data?.generated_at ?? null}
        isLoading={aiAnalyze.isPending}
      />
    </div>
  );
}
