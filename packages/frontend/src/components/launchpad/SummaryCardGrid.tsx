import { useState, useEffect } from "react";
import SummaryCard from "./SummaryCard";

interface SummaryData {
  action_items_due_today: number;
  opportunities_hot: number;
  capture_behind: number;
  partner_new_awards_7d: number;
}

export default function SummaryCardGrid() {
  const [data, setData] = useState<SummaryData>({
    action_items_due_today: 0,
    opportunities_hot: 0,
    capture_behind: 0,
    partner_new_awards_7d: 0,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/launchpad/summary?ou_tag=envision");
        if (res.ok) {
          const body = await res.json();
          if (body.data) setData(body.data);
        }
      } catch {
        // non-critical
      }
    }
    load();
  }, []);

  return (
    <div className="summary-grid">
      <SummaryCard
        count={data.action_items_due_today}
        label="Action Items Due Today"
        href="/action-items?due=today"
      />
      <SummaryCard
        count={data.opportunities_hot}
        label="Opportunities Hot"
        href="/opportunities-v2?hot=1"
      />
      <SummaryCard
        count={data.capture_behind}
        label="Capture Stages Behind"
        href="/capture-v2?behind=1"
      />
      <SummaryCard
        count={data.partner_new_awards_7d}
        label="Partner Awards (7d)"
        href="/partner-intel?new_awards=7d"
      />
    </div>
  );
}
