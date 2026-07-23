"use client";

import { useState } from "react";
import {
  useCapabilities,
  useCreateCapability,
  useUpdateCapability,
  type Capability,
} from "@/hooks/use-capabilities";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { cn } from "@/lib/utils";

const OU_LABELS: Record<string, string> = {
  envision: "Envision (OU3)",
  riverstone: "Riverstone (OU2)",
  pd_systems: "PD Systems (OU1)",
};

const OU_COLORS: Record<string, string> = {
  envision: "border-gda-green/40 text-gda-green",
  riverstone: "border-gda-cyan/40 text-gda-cyan",
  pd_systems: "border-gda-amber/40 text-gda-amber",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-gda-green",
  B: "text-gda-cyan",
  C: "text-gda-amber",
};

type OuFilter = "all" | "envision" | "riverstone" | "pd_systems";

export default function CapabilitiesPage() {
  const [ouFilter, setOuFilter] = useState<OuFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: capabilities, isLoading, error, refetch } = useCapabilities({
    ou: ouFilter !== "all" ? ouFilter : undefined,
    include_inactive: true,
  });

  const envisionCount = capabilities?.filter((c) => c.ou === "envision" && c.active).length ?? 0;
  const riverstoneCount = capabilities?.filter((c) => c.ou === "riverstone" && c.active).length ?? 0;
  const pdCount = capabilities?.filter((c) => c.ou === "pd_systems" && c.active).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
          Capabilities
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Envision capability catalog drives auto-qualification. Riverstone and PD Systems are teaming context only.
        </p>
      </div>

      {/* OU filter tabs */}
      <div className="flex items-center gap-2">
        {(["all", "envision", "riverstone", "pd_systems"] as const).map((ou) => {
          const count = ou === "all" ? (envisionCount + riverstoneCount + pdCount) : ou === "envision" ? envisionCount : ou === "riverstone" ? riverstoneCount : pdCount;
          return (
            <button
              key={ou}
              type="button"
              onClick={() => setOuFilter(ou)}
              className={cn(
                "px-3 py-1.5 text-xs font-mono rounded border transition-colors",
                ouFilter === ou
                  ? "border-gda-green text-gda-green bg-gda-green/10"
                  : "border-border text-muted-foreground hover:border-gda-green/50",
              )}
            >
              {ou === "all" ? "All" : OU_LABELS[ou]} ({count})
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => { setShowAddForm(true); setEditingId(null); }}
          className="ml-auto px-3 py-1.5 text-xs font-mono rounded border border-gda-green text-gda-green hover:bg-gda-green/10 transition-colors"
        >
          + Add Capability
        </button>
      </div>

      {error && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : (
        <>
          {showAddForm && (
            <CapabilityForm
              onClose={() => setShowAddForm(false)}
              ouFilter={ouFilter === "all" ? "envision" : ouFilter}
            />
          )}

          {/* Group by OU section */}
          {["envision", "riverstone", "pd_systems"].map((ou) => {
            const ouCaps = (capabilities ?? []).filter((c) => c.ou === ou);
            if (ouFilter !== "all" && ouFilter !== ou) return null;
            if (ouCaps.length === 0) return null;

            const isReadOnly = ou !== "envision";

            return (
              <div key={ou} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-sm font-bold text-foreground">
                    {OU_LABELS[ou]}
                  </h2>
                  {isReadOnly && (
                    <Badge variant="outline" className="text-[12px] border-gda-amber/30 text-gda-amber">
                      READ-ONLY (teaming context)
                    </Badge>
                  )}
                  <span className="text-[12px] font-mono text-muted-foreground">
                    {ouCaps.filter((c) => c.active).length} active
                  </span>
                </div>

                <div className="space-y-1">
                  {ouCaps.map((cap) => (
                    <CapabilityRow
                      key={cap.id}
                      capability={cap}
                      isReadOnly={isReadOnly}
                      isEditing={editingId === cap.id}
                      onEdit={() => setEditingId(editingId === cap.id ? null : cap.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {(capabilities ?? []).length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground text-sm font-mono">
              No capabilities found. Add your first capability to start auto-qualification.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CapabilityRow({
  capability,
  isReadOnly,
  isEditing,
  onEdit,
}: {
  capability: Capability;
  isReadOnly: boolean;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const updateCap = useUpdateCapability();
  const { toast } = useToast();

  const gradeColor = capability.evidence_grade ? GRADE_COLORS[capability.evidence_grade] : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded border border-border bg-gda-panel p-3 transition-colors",
        !capability.active && "opacity-50",
        isEditing && "ring-1 ring-gda-green/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{capability.name}</span>
            <Badge
              variant="outline"
              className={cn("text-[12px]", OU_COLORS[capability.ou])}
            >
              {capability.ou}
            </Badge>
            <Badge variant="outline" className="text-[12px]">
              {capability.category}
            </Badge>
            {capability.evidence_grade && (
              <span className={cn("font-mono text-[12px] font-bold", gradeColor)}>
                Grade {capability.evidence_grade}
              </span>
            )}
            {!capability.active && (
              <Badge variant="outline" className="text-[12px] border-gda-red/30 text-gda-red">
                Inactive
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {capability.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {capability.naics_codes.length > 0 && (
              <span className="text-[12px] font-mono text-muted-foreground/60">
                NAICS: {capability.naics_codes.join(", ")}
              </span>
            )}
            {capability.psc_codes.length > 0 && (
              <span className="text-[12px] font-mono text-muted-foreground/60">
                PSC: {capability.psc_codes.join(", ")}
              </span>
            )}
            {capability.certifications.length > 0 && (
              <span className="text-[12px] font-mono text-muted-foreground/60">
                Certs: {capability.certifications.join(", ")}
              </span>
            )}
            {capability.agencies_strong_in.length > 0 && (
              <span className="text-[12px] font-mono text-muted-foreground/60">
                Agencies: {capability.agencies_strong_in.join(", ")}
              </span>
            )}
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="px-2 py-1 text-[12px] font-mono text-muted-foreground hover:text-gda-green transition-colors"
            >
              {isEditing ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => {
                updateCap.mutate(
                  { id: capability.id, active: !capability.active },
                  {
                    onSuccess: () => toast(capability.active ? "Deactivated" : "Activated", "success"),
                    onError: (err) => toast(`Failed: ${err.message}`, "error"),
                  },
                );
              }}
              disabled={updateCap.isPending}
              className="px-2 py-1 text-[12px] font-mono text-muted-foreground hover:text-gda-amber transition-colors"
            >
              {capability.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        )}
      </div>

      {isEditing && !isReadOnly && (
        <CapabilityEditForm capability={capability} onClose={onEdit} />
      )}
    </div>
  );
}

function CapabilityEditForm({
  capability,
  onClose,
}: {
  capability: Capability;
  onClose: () => void;
}) {
  const updateCap = useUpdateCapability();
  const { toast } = useToast();

  const [name, setName] = useState(capability.name);
  const [category, setCategory] = useState(capability.category);
  const [description, setDescription] = useState(capability.description);
  const [naicsCodes, setNaicsCodes] = useState(capability.naics_codes.join(", "));
  const [pscCodes, setPscCodes] = useState(capability.psc_codes.join(", "));
  const [agencies, setAgencies] = useState(capability.agencies_strong_in.join(", "));
  const [certifications, setCertifications] = useState(capability.certifications.join(", "));
  const [evidenceGrade, setEvidenceGrade] = useState(capability.evidence_grade ?? "");

  const handleSave = () => {
    updateCap.mutate(
      {
        id: capability.id,
        name,
        category,
        description,
        naics_codes: naicsCodes.split(",").map((s) => s.trim()).filter(Boolean),
        psc_codes: pscCodes.split(",").map((s) => s.trim()).filter(Boolean),
        agencies_strong_in: agencies.split(",").map((s) => s.trim()).filter(Boolean),
        certifications: certifications.split(",").map((s) => s.trim()).filter(Boolean),
        evidence_grade: (evidenceGrade as "A" | "B" | "C") || undefined,
      },
      {
        onSuccess: () => { toast("Capability updated", "success"); onClose(); },
        onError: (err) => toast(`Update failed: ${err.message}`, "error"),
      },
    );
  };

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Name" value={name} onChange={setName} />
        <FormField label="Category" value={category} onChange={setCategory} />
      </div>
      <FormField label="Description" value={description} onChange={setDescription} multiline />
      <div className="grid grid-cols-2 gap-2">
        <FormField label="NAICS Codes (comma-separated)" value={naicsCodes} onChange={setNaicsCodes} />
        <FormField label="PSC Codes (comma-separated)" value={pscCodes} onChange={setPscCodes} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Agencies Strong In (comma-separated)" value={agencies} onChange={setAgencies} />
        <FormField label="Certifications (comma-separated)" value={certifications} onChange={setCertifications} />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-[12px] text-muted-foreground">Evidence Grade</label>
        <select
          value={evidenceGrade}
          onChange={(e) => setEvidenceGrade(e.target.value)}
          className="rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">--</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateCap.isPending}
          className="ml-auto px-3 py-1 text-xs font-mono rounded border border-gda-green text-gda-green hover:bg-gda-green/10 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs font-mono text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CapabilityForm({
  onClose,
  ouFilter,
}: {
  onClose: () => void;
  ouFilter: string;
}) {
  const createCap = useCreateCapability();
  const { toast } = useToast();

  const [ou, setOu] = useState(ouFilter);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [naicsCodes, setNaicsCodes] = useState("");
  const [pscCodes, setPscCodes] = useState("");
  const [agencies, setAgencies] = useState("");
  const [certifications, setCertifications] = useState("");
  const [evidenceGrade, setEvidenceGrade] = useState("");

  const handleCreate = () => {
    if (!name || !category || !description) {
      toast("Name, category, and description are required", "error");
      return;
    }
    createCap.mutate(
      {
        ou: ou as "envision" | "riverstone" | "pd_systems",
        name,
        category,
        description,
        naics_codes: naicsCodes.split(",").map((s) => s.trim()).filter(Boolean),
        psc_codes: pscCodes.split(",").map((s) => s.trim()).filter(Boolean),
        agencies_strong_in: agencies.split(",").map((s) => s.trim()).filter(Boolean),
        key_personnel: [],
        past_performance_doc_ids: [],
        certifications: certifications.split(",").map((s) => s.trim()).filter(Boolean),
        evidence_grade: (evidenceGrade as "A" | "B" | "C") || null,
      },
      {
        onSuccess: () => { toast("Capability created", "success"); onClose(); },
        onError: (err) => toast(`Create failed: ${err.message}`, "error"),
      },
    );
  };

  return (
    <Card className="border-gda-green/30 bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          New Capability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[12px] text-muted-foreground block mb-0.5">OU</label>
            <select
              value={ou}
              onChange={(e) => setOu(e.target.value)}
              className="w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            >
              <option value="envision">Envision</option>
              <option value="riverstone">Riverstone</option>
              <option value="pd_systems">PD Systems</option>
            </select>
          </div>
          <FormField label="Name" value={name} onChange={setName} />
          <FormField label="Category" value={category} onChange={setCategory} />
        </div>
        <FormField label="Description" value={description} onChange={setDescription} multiline />
        <div className="grid grid-cols-2 gap-2">
          <FormField label="NAICS Codes (comma-separated)" value={naicsCodes} onChange={setNaicsCodes} />
          <FormField label="PSC Codes (comma-separated)" value={pscCodes} onChange={setPscCodes} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Agencies Strong In" value={agencies} onChange={setAgencies} />
          <FormField label="Certifications" value={certifications} onChange={setCertifications} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[12px] text-muted-foreground">Evidence Grade</label>
          <select
            value={evidenceGrade}
            onChange={(e) => setEvidenceGrade(e.target.value)}
            className="rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
          >
            <option value="">--</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createCap.isPending}
            className="ml-auto px-3 py-1 text-xs font-mono rounded border border-gda-green text-gda-green hover:bg-gda-green/10 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-[12px] text-muted-foreground block mb-0.5">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        />
      )}
    </div>
  );
}
