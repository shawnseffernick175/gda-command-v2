import { useState } from "react";
import { authenticatedFetch } from "../../api/auth";

interface Worksheet {
  partner_ou_tag: string;
  certs_claimed: string[];
  vehicles_listed: string[];
  pp_highlights: string[];
  rationale_paragraph: string;
}

interface Props {
  captureId: number;
}

const PARTNERS = [
  { tag: "riverstone", label: "Riverstone" },
  { tag: "pd_systems", label: "PD Systems" },
];

export default function TeamingWorksheetPanel({ captureId }: Props) {
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const togglePartner = (tag: string) => {
    setSelectedPartners((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag],
    );
  };

  const handleGenerate = async () => {
    if (selectedPartners.length === 0) return;
    setGenerating(true);
    try {
      const res = await authenticatedFetch(
        `/api/captures/${captureId}/generate-teaming-worksheet`,
        {
          method: "POST",
          body: JSON.stringify({ partner_ou_tags: selectedPartners }),
        },
      );
      const json = await res.json();
      if (json.success && json.data?.worksheets) {
        setWorksheets(json.data.worksheets);
      }
    } catch {
      // non-fatal
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="card">
      <h3 className="text-section text-ink mb-4">Teaming Worksheet</h3>
      <p className="text-caption text-muted italic mb-4">
        Doctrine: Teamwork &middot; Pull partner certs, vehicles, and PP from
        Partner Intel
      </p>

      <div className="flex items-center gap-4 mb-4">
        {PARTNERS.map((p) => (
          <label
            key={p.tag}
            className="flex items-center gap-2 text-body text-ink cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedPartners.includes(p.tag)}
              onChange={() => togglePartner(p.tag)}
              className="accent-accent"
            />
            {p.label}
          </label>
        ))}
        <button
          className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms] disabled:opacity-50"
          onClick={handleGenerate}
          disabled={generating || selectedPartners.length === 0}
        >
          {generating ? "Generating..." : "Generate Worksheet"}
        </button>
      </div>

      {worksheets.map((ws) => (
        <div key={ws.partner_ou_tag} className="mb-6 last:mb-0">
          <h4 className="text-body text-ink font-semibold mb-2">
            {PARTNERS.find((p) => p.tag === ws.partner_ou_tag)?.label ||
              ws.partner_ou_tag}
          </h4>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Certifications
              </p>
              {ws.certs_claimed.length > 0 ? (
                <ul className="text-caption text-ink">
                  {ws.certs_claimed.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted">None listed</p>
              )}
            </div>
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Vehicles
              </p>
              {ws.vehicles_listed.length > 0 ? (
                <ul className="text-caption text-ink">
                  {ws.vehicles_listed.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted">None listed</p>
              )}
            </div>
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Past Performance
              </p>
              {ws.pp_highlights.length > 0 ? (
                <ul className="text-caption text-ink">
                  {ws.pp_highlights.map((pp) => (
                    <li key={pp}>{pp}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted">No recent awards</p>
              )}
            </div>
          </div>

          <div className="bg-bg rounded p-4 border border-border">
            <p className="text-caption text-muted uppercase tracking-wider mb-2">
              Rationale Paragraph
            </p>
            <p className="text-body text-ink mb-2">
              {ws.rationale_paragraph}
            </p>
            <button
              className="h-8 px-4 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
              onClick={() =>
                copyToClipboard(ws.rationale_paragraph, ws.partner_ou_tag)
              }
            >
              {copied === ws.partner_ou_tag ? "Copied" : "Copy to Clipboard"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
