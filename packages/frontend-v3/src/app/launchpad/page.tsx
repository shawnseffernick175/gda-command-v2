"use client";

import { useState } from "react";
import { useDailyNews, useNewsFeedback } from "@/hooks/use-launchpad";
import Day1Banners from "@/components/launchpad/Day1Banners";
import SitrepBlock from "@/components/launchpad/SitrepBlock";
import LaunchpadNewsCard from "@/components/launchpad/LaunchpadNewsCard";
import DoorSummaries from "@/components/launchpad/DoorSummaries";
import WhatNeedsMePanel from "@/components/digest/WhatNeedsMePanel";
import { LaunchpadRisksPanel } from "@/components/LaunchpadRisksPanel";

function formatHeaderDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function formatHeaderTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export default function LaunchpadPage() {
  const [showExcluded, setShowExcluded] = useState(false);
  const { data: newsData, isLoading: newsLoading } = useDailyNews({
    limit: 15,
    showExcluded,
  });
  const feedbackMutation = useNewsFeedback();

  const handleFeedback = (newsId: number, action: "clicked" | "dismissed" | "saved") => {
    feedbackMutation.mutate({ news_id: newsId, action });
  };

  const items = newsData?.items ?? [];
  const quietMorning = newsData?.quiet_morning ?? false;
  const lastActivity = newsData?.generated_at ?? null;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 pt-6">
        <h1 className="text-sm font-bold text-white uppercase tracking-widest">
          GDA Command · Launchpad · {formatHeaderDate()} · {formatHeaderTime()}
        </h1>
      </div>

      {/* SITREP — F-SITREP */}
      <SitrepBlock />

      {/* Day-1 Banners */}
      <section>
        <h2 className="font-mono text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
          Day-1 Banners
        </h2>
        <Day1Banners />
      </section>

      {/* Daily News */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-mono text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Daily News
          </h2>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={(e) => setShowExcluded(e.target.checked)}
              className="accent-gda-cyan h-3 w-3"
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              Show excluded items
            </span>
          </label>
        </div>

        {newsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded border border-border bg-gda-panel p-3 h-20 animate-pulse" />
            ))}
          </div>
        ) : quietMorning ? (
          <div className="rounded border border-border bg-gda-panel p-4">
            <p className="font-mono text-xs text-muted-foreground">
              Quiet morning — no qualifying activity since{" "}
              {lastActivity
                ? new Date(lastActivity).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/New_York",
                    timeZoneName: "short",
                  })
                : "last check"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <LaunchpadNewsCard
                key={item.id}
                item={item}
                onFeedback={handleFeedback}
              />
            ))}
          </div>
        )}
      </section>

      {/* What Needs Me Today */}
      <section>
        <h2 className="font-mono text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
          What Needs Me Today
        </h2>
        <WhatNeedsMePanel />
      </section>

      {/* Door Summaries */}
      <section>
        <h2 className="font-mono text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
          Door Summaries
        </h2>
        <DoorSummaries />
      </section>

      {/* What's at Risk */}
      <section>
        <LaunchpadRisksPanel />
      </section>
    </div>
  );
}
