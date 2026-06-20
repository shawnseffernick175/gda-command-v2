"use client";

import { useState, useCallback } from "react";
import { StatusStrip } from "@/components/financials/StatusStrip";
import { AiAnalyzeModal } from "@/components/financials/AiAnalyzeModal";
import { ContractWaterfallTab } from "@/components/financials/tabs/ContractWaterfallTab";
import { AopPlanTab } from "@/components/financials/tabs/AopPlanTab";
import { AopExecutionTab } from "@/components/financials/tabs/AopExecutionTab";
import { AopCaptureTab } from "@/components/financials/tabs/AopCaptureTab";
import { P2FinancialsTab } from "@/components/financials/tabs/P2FinancialsTab";
import { DefinitionsTab } from "@/components/financials/tabs/DefinitionsTab";
import { BalanceSheetCard } from "@/components/financials/BalanceSheetCard";
import {
  useAiAnalyze,
  useP2Financials,
} from "@/hooks/use-financial-bible";
import { cn } from "@/lib/utils";

type Tab =
  | "waterfall"
  | "plan"
  | "execution"
  | "capture"
  | "p2"
  | "balance-sheet"
  | "definitions";

const TABS: { id: Tab; label: string }[] = [
  { id: "waterfall", label: "Contract Waterfall" },
  { id: "plan", label: "AOP Plan" },
  { id: "execution", label: "AOP Execution" },
  { id: "capture", label: "AOP Capture" },
  { id: "p2", label: "Monthly Financials" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "definitions", label: "Definitions" },
];

// Only these tabs actually consume the FY/CY + year selection; the others
// ignore it, so we disable the year controls when they're active rather than
// letting the control imply it does something it doesn't.
const YEAR_AWARE_TABS: ReadonlySet<Tab> = new Set(["plan", "execution", "capture"]);

type CalendarMode = "FY" | "CY";

const YEARS = ["26", "27", "28"] as const;

function tabTitle(tab: Tab): string {
  switch (tab) {
    case "waterfall":
      return "Contract Waterfall";
    case "plan":
      return "AOP Plan";
    case "execution":
      return "AOP Execution";
    case "capture":
      return "AOP Capture";
    case "p2":
      return "Monthly Financials";
    case "balance-sheet":
      return "Balance Sheet";
    case "definitions":
      return "Definitions";
  }
}

export default function FinancialsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("p2");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("FY");
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
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        {/* Status Strip */}
        <StatusStrip />

        {/* Tab bar with AI Analyze + Year Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: AI Analyze button + tabs */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="rounded px-3 py-1.5 text-[13px] font-medium text-white transition-colors bg-fin-navy hover:bg-fin-navy-hover"
              onClick={handleAiAnalyze}
            >
              AI Analyze
            </button>

            <nav className="flex items-center gap-4">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "border-b-2 pb-1 text-[13px] font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-gda-cyan text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right: FY/CY toggle + year buttons */}
          <div
            className={cn(
              "flex items-center gap-2",
              !yearControlsActive && "opacity-40",
            )}
            title={
              yearControlsActive
                ? undefined
                : "Year selection applies only to AOP Plan, AOP Execution and AOP Capture"
            }
          >
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
        </div>

        {/* Page title + subtitle */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {tabTitle(activeTab)}
            {yearControlsActive ? ` \u2014 ${fy}` : ""}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Envision Innovative Solutions (OU3) {"\u2014"} 6% YoY Growth Target
          </p>
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === "waterfall" && <ContractWaterfallTab />}
        {activeTab === "plan" && <AopPlanTab fy={fy} />}
        {activeTab === "execution" && <AopExecutionTab fy={fy} />}
        {activeTab === "capture" && <AopCaptureTab fy={fy} />}
        {activeTab === "p2" && <P2FinancialsTab />}
        {activeTab === "balance-sheet" && <BalanceSheetCard />}
        {activeTab === "definitions" && <DefinitionsTab />}
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
