import { useState } from "react";
import { authenticatedFetch } from "../../api/auth";

interface ComplianceItem {
  id: number;
  capture_id: number;
  section_number: string | null;
  requirement_text: string;
  owner_team: string | null;
  status: string;
  evidence_link: string | null;
}

interface Props {
  captureId: number;
  items: ComplianceItem[];
  onItemsChange: (items: ComplianceItem[]) => void;
}

const STATUS_OPTIONS = ["open", "in_progress", "complete", "waived"];

export default function ComplianceMatrix({
  captureId,
  items,
  onItemsChange,
}: Props) {
  const [saving, setSaving] = useState<number | null>(null);

  const handleFieldChange = async (
    item: ComplianceItem,
    field: "status" | "owner_team" | "evidence_link",
    value: string,
  ) => {
    setSaving(item.id);
    try {
      const res = await authenticatedFetch(`/api/compliance-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        onItemsChange(
          items.map((i) => (i.id === item.id ? json.data : i)),
        );
      }
    } catch {
      // non-fatal
    } finally {
      setSaving(null);
    }
  };

  if (items.length === 0) {
    return null;
  }

  const totalCount = items.length;
  const openCount = items.filter((i) => i.status === "open").length;
  const completeCount = items.filter((i) => i.status === "complete").length;
  const completePct = totalCount > 0 ? (completeCount / totalCount) * 100 : 0;

  return (
    <div className="card">
      <h3 className="text-section text-ink mb-4">Compliance Matrix</h3>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-caption text-muted">
          {totalCount} total, {openCount} open, {completeCount} complete
        </span>
        <div className="flex-1 h-2 rounded bg-border overflow-hidden">
          <div
            className="h-full rounded bg-accent transition-all duration-[120ms]"
            style={{ width: `${completePct}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-4">
                Section
              </th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-4">
                Requirement
              </th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-4">
                Owner
              </th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-4">
                Status
              </th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2">
                Evidence
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border"
              >
                <td className="py-2 pr-4 text-caption text-muted align-top whitespace-nowrap">
                  {item.section_number || "—"}
                </td>
                <td className="py-2 pr-4 text-body text-ink align-top max-w-md">
                  <p className="line-clamp-3">{item.requirement_text}</p>
                </td>
                <td className="py-2 pr-4 align-top">
                  <input
                    type="text"
                    defaultValue={item.owner_team || ""}
                    className="w-24 px-2 py-1 text-caption border border-border rounded bg-white text-ink"
                    onBlur={(e) =>
                      handleFieldChange(item, "owner_team", e.target.value)
                    }
                    disabled={saving === item.id}
                  />
                </td>
                <td className="py-2 pr-4 align-top">
                  <select
                    value={item.status}
                    onChange={(e) =>
                      handleFieldChange(item, "status", e.target.value)
                    }
                    className="px-2 py-1 text-caption border border-border rounded bg-white text-ink"
                    disabled={saving === item.id}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 align-top">
                  <input
                    type="text"
                    defaultValue={item.evidence_link || ""}
                    placeholder="URL or note"
                    className="w-32 px-2 py-1 text-caption border border-border rounded bg-white text-ink"
                    onBlur={(e) =>
                      handleFieldChange(item, "evidence_link", e.target.value)
                    }
                    disabled={saving === item.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
