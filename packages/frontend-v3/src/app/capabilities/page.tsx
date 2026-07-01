"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import {
  useCapabilities,
  useUpdateCapability,
  useSeedCapabilities,
  type Capability,
  type OU,
} from "@/hooks/use-capabilities";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OU_LABELS: Record<OU, string> = {
  envision: "Envision (OU3)",
  riverstone: "Riverstone (OU2)",
  pd_systems: "PD Systems (OU1)",
};

const OU_TABS: { key: OU | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "envision", label: "Envision" },
  { key: "riverstone", label: "Riverstone" },
  { key: "pd_systems", label: "PD Systems" },
];

const CATEGORY_LABELS: Record<string, string> = {
  training_simulation: "Training & Simulation",
  systems_engineering: "Systems Engineering",
  logistics_sustainment: "Logistics & Sustainment",
  field_services: "Field Services",
  c5isr: "C5ISR",
  digital_readiness: "Digital Readiness",
  program_management: "Program Management",
  intelligence: "Intelligence",
  cyber: "Cyber",
  software: "Software",
};

function gradeColor(grade: string | null): string {
  if (grade === "A") return "text-gda-green border-gda-green/40 bg-gda-green/10";
  if (grade === "B") return "text-gda-amber border-gda-amber/40 bg-gda-amber/10";
  if (grade === "C") return "text-gda-red border-gda-red/40 bg-gda-red/10";
  return "text-muted-foreground border-border";
}

export default function CapabilitiesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <CapabilitiesContent />
    </Suspense>
  );
}

function CapabilitiesContent() {
  const [ouFilter, setOuFilter] = useState<OU | "all">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { toast } = useToast();

  const { data: capabilities, isLoading } = useCapabilities({
    ou: ouFilter === "all" ? undefined : ouFilter,
    active: showInactive ? undefined : true,
  });

  const updateMutation = useUpdateCapability();
  const seedMutation = useSeedCapabilities();

  const filtered = useMemo(() => {
    if (!capabilities) return [];
    if (!q.trim()) return capabilities;
    const lower = q.toLowerCase();
    return capabilities.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower) ||
        c.description.toLowerCase().includes(lower) ||
        c.naics_codes.some((n) => n.includes(lower)),
    );
  }, [capabilities, q]);

  const grouped = useMemo(() => {
    const groups: Record<string, Capability[]> = {};
    for (const cap of filtered) {
      const key = cap.ou;
      if (!groups[key]) groups[key] = [];
      groups[key]!.push(cap);
    }
    return groups;
  }, [filtered]);

  const handleToggleActive = useCallback(
    (cap: Capability) => {
      updateMutation.mutate(
        { id: cap.id, active: !cap.active },
        {
          onSuccess: () => {
            toast(cap.active ? "Capability deactivated" : "Capability activated", "success");
          },
          onError: () => {
            toast("Failed to update capability", "error");
          },
        },
      );
    },
    [updateMutation, toast],
  );

  const handleSeed = useCallback(() => {
    seedMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast(`Seeded ${data.inserted} capabilities (${data.skipped} already existed)`, "success");
      },
      onError: () => {
        toast("Seed failed", "error");
      },
    });
  }, [seedMutation, toast]);

  const envisionCount = capabilities?.filter((c) => c.ou === "envision" && c.active).length ?? 0;
  const totalCount = capabilities?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 border-b border-border bg-gda-bg-deep pb-3 pt-6 space-y-4 sticky-page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
                Capability Catalog
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Envision offerings matched against opportunities for qualification gating
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              OU1/OU2 catalogs are read-only teaming context
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {envisionCount} Envision / {totalCount} total
            </Badge>
            <button
              onClick={handleSeed}
              disabled={seedMutation.isPending}
              className="rounded border border-border bg-white px-3 py-1 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep disabled:opacity-50"
            >
              {seedMutation.isPending ? "Seeding..." : "Seed Catalog"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-0">
            {OU_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setOuFilter(tab.key)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[13px] transition-colors",
                  ouFilter === tab.key
                    ? "border-gda-green text-gda-green"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search capabilities..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded border border-border bg-white px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/40 w-64"
          />

          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border"
            />
            Show inactive
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full bg-gda-panel" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No capabilities found. Use Seed Catalog to load the Envision offering catalog.
        </div>
      ) : (
        Object.entries(grouped).map(([ou, caps]) => (
          <div key={ou} className="space-y-3">
            <h2 className="font-mono text-sm font-semibold text-foreground">
              {OU_LABELS[ou as OU] ?? ou}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({caps.length} capabilities)
              </span>
              {ou !== "envision" && (
                <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                  Read-only teaming context
                </span>
              )}
            </h2>
            <div className="grid gap-3">
              {caps.map((cap) => (
                <CapabilityCard
                  key={cap.id}
                  capability={cap}
                  isEditing={editingId === cap.id}
                  onToggleEdit={() =>
                    setEditingId(editingId === cap.id ? null : cap.id)
                  }
                  onToggleActive={() => handleToggleActive(cap)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CapabilityCard({
  capability: cap,
  isEditing,
  onToggleEdit,
  onToggleActive,
}: {
  capability: Capability;
  isEditing: boolean;
  onToggleEdit: () => void;
  onToggleActive: () => void;
}) {
  const [editName, setEditName] = useState(cap.name);
  const [editDesc, setEditDesc] = useState(cap.description);
  const [editCategory, setEditCategory] = useState(cap.category);
  const updateMutation = useUpdateCapability();
  const { toast } = useToast();

  const handleSave = () => {
    updateMutation.mutate(
      { id: cap.id, name: editName, description: editDesc, category: editCategory },
      {
        onSuccess: () => {
          toast("Capability updated", "success");
          onToggleEdit();
        },
        onError: () => {
          toast("Update failed", "error");
        },
      },
    );
  };

  const [now] = useState(() => Date.now());
  const staleReview =
    cap.last_reviewed_at &&
    now - new Date(cap.last_reviewed_at).getTime() > 90 * 24 * 60 * 60 * 1000;

  return (
    <Card className={cn("transition-colors", !cap.active && "opacity-60")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded border border-border bg-white px-2 py-1 text-sm font-semibold text-foreground"
              />
            ) : (
              <CardTitle className="text-sm font-semibold">{cap.name}</CardTitle>
            )}
            <Badge
              variant="outline"
              className={cn("text-[11px] font-mono", gradeColor(cap.evidence_grade))}
            >
              {cap.evidence_grade ?? "—"}
            </Badge>
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              {CATEGORY_LABELS[cap.category] ?? cap.category}
            </Badge>
            {!cap.active && (
              <Badge variant="outline" className="text-[11px] text-gda-red border-gda-red/40">
                Inactive
              </Badge>
            )}
            {staleReview && (
              <Badge variant="outline" className="text-[11px] text-gda-amber border-gda-amber/40">
                Review overdue
              </Badge>
            )}
          </div>
          {cap.ou === "envision" && (
            <div className="flex gap-1">
              <button
                onClick={onToggleEdit}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-gda-panel hover:text-foreground"
              >
                {isEditing ? "Cancel" : "Edit"}
              </button>
              {isEditing && (
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="rounded border border-gda-green/40 bg-gda-green/10 px-2 py-0.5 text-[11px] text-gda-green transition-colors hover:bg-gda-green/20 disabled:opacity-50"
                >
                  Save
                </button>
              )}
              <button
                onClick={onToggleActive}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-gda-panel hover:text-foreground"
              >
                {cap.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Category</label>
              <input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="mt-0.5 w-full rounded border border-border bg-white px-2 py-1 text-[13px] text-foreground"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="mt-0.5 w-full rounded border border-border bg-white px-2 py-1 text-[13px] text-foreground"
              />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">{cap.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
          {cap.naics_codes.length > 0 && (
            <div>
              <span className="text-muted-foreground">NAICS: </span>
              <span className="font-mono text-foreground">
                {cap.naics_codes.join(", ")}
              </span>
            </div>
          )}
          {cap.psc_codes.length > 0 && (
            <div>
              <span className="text-muted-foreground">PSC: </span>
              <span className="font-mono text-foreground">
                {cap.psc_codes.join(", ")}
              </span>
            </div>
          )}
          {cap.agencies_strong_in.length > 0 && (
            <div>
              <span className="text-muted-foreground">Agencies: </span>
              <span className="text-foreground">
                {cap.agencies_strong_in.join(", ")}
              </span>
            </div>
          )}
          {cap.certifications.length > 0 && (
            <div>
              <span className="text-muted-foreground">Certs: </span>
              <span className="text-foreground">
                {cap.certifications.join(", ")}
              </span>
            </div>
          )}
          {cap.past_performance_doc_ids.length > 0 && (
            <div>
              <span className="text-muted-foreground">PP Docs: </span>
              <span className="font-mono text-foreground">
                {cap.past_performance_doc_ids.length}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
