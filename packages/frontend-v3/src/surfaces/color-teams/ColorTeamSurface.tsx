import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button/Button';
import { RunColorTeamModal } from './components/RunColorTeamModal';
import { ColorStatusPill } from './components/ColorStatusPill';
import { fetchDocuments, uploadDocument, startColorTeamRun, fetchDocumentRuns } from './api';
import type { Document, ColorTeamColor, ColorTeamRun } from './types';

export function ColorTeamSurface() {
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadFormOpen, setUploadFormOpen] = useState(false);
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadDocType, setUploadDocType] = useState('rfp_draft');

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['color-team-documents'],
    queryFn: () => fetchDocuments({ limit: 100 }),
  });

  const { data: runsData } = useQuery({
    queryKey: ['color-team-runs', selectedDoc?.id],
    queryFn: () => fetchDocumentRuns(selectedDoc!.id),
    enabled: !!selectedDoc,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['color-team-documents'] });
      setUploadFormOpen(false);
      setUploadFilename('');
    },
  });

  const runMutation = useMutation({
    mutationFn: (args: { colors: ColorTeamColor[] }) =>
      startColorTeamRun({ document_id: selectedDoc!.id, colors: args.colors }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['color-team-runs', selectedDoc?.id] });
      setModalOpen(false);
    },
  });

  const handleUpload = () => {
    if (!uploadFilename.trim()) return;
    uploadMutation.mutate({
      filename: uploadFilename,
      storage_path: `/uploads/${uploadFilename}`,
      doc_type: uploadDocType,
    });
  };

  const documents = docsData?.items ?? [];
  const runs = runsData?.runs ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-primary">Color Team Reviews</h1>
        <Button variant="primary" onClick={() => setUploadFormOpen(true)}>
          + Upload Document
        </Button>
      </div>

      {uploadFormOpen && (
        <div className="border border-border rounded-sm p-4 bg-surface flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-primary">Upload Document</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={uploadFilename}
              onChange={(e) => setUploadFilename(e.target.value)}
              placeholder="Filename (e.g. proposal-v2.pdf)"
              className="flex-1 h-8 px-3 text-sm border border-border rounded-sm bg-canvas text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
            />
            <select
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
              className="h-8 px-3 text-sm border border-border rounded-sm bg-canvas text-ink-primary focus:outline-none focus:border-accent"
            >
              <option value="rfp_draft">RFP Draft</option>
              <option value="capture_plan">Capture Plan</option>
              <option value="white_paper">White Paper</option>
              <option value="proposal_section">Proposal Section</option>
              <option value="proposal_full">Full Proposal</option>
              <option value="unknown">Other</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setUploadFormOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              loading={uploadMutation.isPending}
              disabled={!uploadFilename.trim()}
            >
              Upload
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Document list */}
        <div className="w-80 flex-shrink-0 border border-border rounded-sm bg-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-surface-raised">
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Documents
            </h3>
          </div>
          {docsLoading ? (
            <div className="p-4 text-sm text-ink-muted">Loading...</div>
          ) : documents.length === 0 ? (
            <div className="p-4 text-sm text-ink-muted italic">
              No documents uploaded yet. Upload a document to start a Color Team review.
            </div>
          ) : (
            <div className="flex flex-col">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-raised transition-colors duration-[var(--duration-state)] ${
                    selectedDoc?.id === doc.id ? 'bg-surface-raised' : ''
                  }`}
                  onClick={() => setSelectedDoc(doc)}
                >
                  <p className="text-sm font-medium text-ink-primary truncate">
                    {doc.filename}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {doc.doc_type.replace(/_/g, ' ')} · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 flex flex-col gap-4">
          {!selectedDoc ? (
            <div className="border border-border rounded-sm p-8 bg-surface text-center">
              <p className="text-sm text-ink-muted">Select a document to view its Color Team reviews.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">{selectedDoc.filename}</h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {selectedDoc.doc_type.replace(/_/g, ' ')} · Uploaded {new Date(selectedDoc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Run Color Team
                </Button>
              </div>

              {runs.length === 0 ? (
                <div className="border border-border rounded-sm p-6 bg-surface text-center">
                  <p className="text-sm text-ink-muted">
                    No reviews yet. Click “Run Color Team” to start.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {runs.map((run) => (
                    <RunCard key={run.id} run={run} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <RunColorTeamModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(colors) => runMutation.mutate({ colors })}
        loading={runMutation.isPending}
      />
    </div>
  );
}

function RunCard({ run }: { run: ColorTeamRun }) {
  return (
    <a
      href={`/color-teams/runs/${run.id}`}
      className="block border border-border rounded-sm p-4 bg-surface hover:bg-surface-raised transition-colors duration-[var(--duration-state)] no-underline"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink-primary">
          Run #{run.id}
        </span>
        <span className="text-xs text-ink-muted">
          {new Date(run.started_at).toLocaleString()}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {run.colors.map((color) => {
          const count = run.finding_counts?.find((c) => c.color === color)?.count;
          return (
            <ColorStatusPill
              key={color}
              color={color as ColorTeamColor}
              status={run.status}
              findingCount={count}
            />
          );
        })}
      </div>
    </a>
  );
}
