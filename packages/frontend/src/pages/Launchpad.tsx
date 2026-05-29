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
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "48px 32px",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          color: "#6b7280",
          fontSize: 15,
        }}
      >
        Loading Launchpad...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "48px 32px",
        background: "#F7F6F2",
        minHeight: "100%",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <LaunchpadHeader dateStr={dateStr} />

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#28251D",
            margin: "0 0 16px 0",
          }}
        >
          Critical Flags
        </h2>
        <CriticalFlagsList flags={flags} onRefresh={fetchFlags} />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#28251D",
            margin: "0 0 16px 0",
          }}
        >
          System Status
        </h2>
        <SystemStatusStrip />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#28251D",
            margin: "0 0 16px 0",
          }}
        >
          Daily Intel
        </h2>
        <DailyIntelList items={intelItems} dateStr={dateStr} />
      </section>

      <footer
        style={{
          borderTop: "1px solid #D4D1CA",
          paddingTop: 24,
          marginTop: 48,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#9ca3af",
            fontStyle: "italic",
          }}
        >
          Doctrine: &ldquo;The standard you walk past is the standard you accept.&rdquo;
        </p>
      </footer>
    </div>
  );
}
