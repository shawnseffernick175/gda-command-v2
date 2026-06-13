"use client";

import { useState } from "react";
import { useKpiHeader } from "@/hooks/use-kpi";
import { CollapseSection } from "@/components/shared/collapse-section";
import { formatMoney } from "@/lib/format-money";
import { FinancialCard } from "@/components/financials/FinancialCard";
import { ForecastChart } from "@/components/financials/ForecastChart";
import { TrendChart } from "@/components/financials/TrendChart";
import { Q1HeroCard } from "@/components/financials/Q1HeroCard";
import { BalanceSheetCard } from "@/components/financials/BalanceSheetCard";
import { BalanceSheetTrendChart } from "@/components/financials/BalanceSheetTrendChart";
import { CostDetailMatrix } from "@/components/financials/CostDetailMatrix";
import { IndirectExpensePanel } from "@/components/financials/IndirectExpensePanel";
import { PeriodDrillDrawer } from "@/components/financials/PeriodDrillDrawer";

export default function FinancialsPage() {
  const { data, isLoading } = useKpiHeader();
  const [drillPeriod, setDrillPeriod] = useState<string | null>(null);

  const hasData = !!data;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">
        Financial Bible
      </h1>
      <p className="text-sm text-muted-foreground">
        Single source of truth for Orders, Sales, EBIT, Gross Margin, and ROS.
        All figures sourced from uploaded financials.
      </p>

      {/* Q1 Hero Card — always show when data exists */}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded bg-gda-panel" />
      ) : hasData ? (
        <Q1HeroCard data={data} />
      ) : null}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gda-panel" />
          ))}
        </div>
      ) : hasData ? (
        <div className="grid gap-4 md:grid-cols-5">
          <FinancialCard
            label="Orders"
            value={formatMoney(data.orders.value)}
            plan={data.orders.plan !== null ? formatMoney(data.orders.plan) : null}
            delta={data.orders.delta}
          />
          <FinancialCard
            label="Sales"
            value={formatMoney(data.sales.value)}
            plan={data.sales.plan !== null ? formatMoney(data.sales.plan) : null}
            delta={data.sales.delta}
          />
          <FinancialCard
            label="EBIT"
            value={formatMoney(data.ebit.value)}
            plan={data.ebit.plan !== null ? formatMoney(data.ebit.plan) : null}
            delta={data.ebit.delta}
          />
          <FinancialCard
            label="Gross Margin"
            value={`${data.gross_margin.value.toFixed(1)}%`}
            plan={data.gross_margin.plan !== null ? `${data.gross_margin.plan.toFixed(1)}%` : null}
            delta={data.gross_margin.delta}
          />
          <FinancialCard
            label="ROS"
            value={`${data.ros.value.toFixed(1)}%`}
            plan={data.ros.plan !== null ? `${data.ros.plan.toFixed(1)}%` : null}
            delta={data.ros.delta}
          />
        </div>
      ) : (
        <div className="rounded border border-dashed border-border bg-gda-panel/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No financial data available yet. Upload financial documents to the Vault
            to populate this dashboard.
          </p>
        </div>
      )}

      <CollapseSection
        id="fin-pipeline-forecast"
        title="Pipeline Forecast vs Plan"
        defaultOpen={true}
      >
        <ForecastChart onPeriodClick={setDrillPeriod} />
      </CollapseSection>

      <CollapseSection
        id="fin-trend"
        title="Historical Trend"
        defaultOpen={true}
      >
        <TrendChart onPeriodClick={setDrillPeriod} />
      </CollapseSection>

      <CollapseSection
        id="fin-balance-sheet"
        title="Balance Sheet"
        defaultOpen={false}
      >
        <BalanceSheetTrendChart />
        <BalanceSheetCard />
      </CollapseSection>

      <CollapseSection
        id="fin-cost-detail"
        title="Cost Detail (TGT vs ACT)"
        defaultOpen={false}
      >
        <CostDetailMatrix />
      </CollapseSection>

      <CollapseSection
        id="fin-indirect-expenses"
        title="Indirect Expenses (SIE)"
        defaultOpen={false}
      >
        <IndirectExpensePanel />
      </CollapseSection>

      {/* Period drill-down drawer */}
      <PeriodDrillDrawer
        period={drillPeriod}
        open={drillPeriod !== null}
        onOpenChange={(open) => {
          if (!open) setDrillPeriod(null);
        }}
      />
    </div>
  );
}
