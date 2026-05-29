import { useState, useEffect, useCallback } from "react";
import LaunchpadHeader from "../components/launchpad/LaunchpadHeader";
import CriticalFlagsList from "../components/launchpad/CriticalFlagsList";
import DailyIntelList from "../components/launchpad/DailyIntelList";
import SystemStatusStrip from "../components/SystemStatusStrip";

interface Flag {
  id: number;
  ou_tag: string;
  flag_key: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  due_date: string | null;
  doctrine_anchor: string | null;
  source_url: string | null;
  is_dismissed: boolean;
}

function getTodayEST(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTodayISOEST(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export default function Launchpad() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [intelItems, setIntelItems] = useState<never[]>([]);
  const [loading, setLoading] = useState(true);

  const dateStr = getTodayEST();
  const dateISO = getTodayISOEST();

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch("/api/launchpad/flags?ou_tag=envision");
      if (res.ok) {
        const body = await res.json();
        setFlags(body?.data?.flags ?? []);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchIntel = useCallback(async () => {
    try {
      const res = await fetch(`/api/launchpad/daily-intel?date=${dateISO}`);
      if (res.ok) {
        const body = await res.json();
        setIntelItems(body?.data?.items ?? []);
      }
    } catch {
      // non-critical
    }
  }, [dateISO]);

  useEffect(() => {
    async function load() {
      await Promise.all([fetchFlags(), fetchIntel()]);
      setLoading(false);
    }
    load();
  }, [fetchFlags, fetchIntel]);

  if (loading) {
    return (
      <div className="container-page py-12 text-muted text-body">
        Loading Launchpad...
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <LaunchpadHeader dateStr={dateStr} />

      <section className="mb-8">
        <h2 className="h-section mb-4">Critical Flags</h2>
        <CriticalFlagsList flags={flags} onRefresh={fetchFlags} />
      </section>

      <section className="mb-8">
        <h2 className="h-section mb-4">System Status</h2>
        <SystemStatusStrip />
      </section>

      <section className="mb-8">
        <h2 className="h-section mb-4">Daily Intel</h2>
        <DailyIntelList items={intelItems} dateStr={dateStr} />
      </section>

      <footer className="border-t border-border pt-6 mt-12">
        <p className="doctrine-tag m-0">
          &ldquo;The standard you walk past is the standard you accept.&rdquo;
        </p>
      </footer>
    </div>
  );
}
