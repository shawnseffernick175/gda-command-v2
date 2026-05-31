import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable/DataTable';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import {
  fetchDocuments,
  fetchRagStatus,
  deleteDocument,
  reingestDocument,
  searchRag,
} from './api';
import type { KbDocument, SearchResult, DocType, OuTag } from './types';
import type { TableColumn } from '../../types';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  ceo_doctrine: 'CEO Doctrine',
  business_plan: 'Business Plan',
  capabilities: 'Capabilities',
  past_performance: 'Past Performance',
  cpar: 'CPAR',
  workflow_spec: 'Workflow Spec',
  rfp: 'RFP',
  proposal_draft: 'Proposal Draft',
  capture_plan: 'Capture Plan',
  partner_intel: 'Partner Intel',
  financial: 'Financial',
  news_article: 'News Article',
  meeting_transcript: 'Meeting Transcript',
  sow: 'SOW',
  awarded_contract: 'Awarded Contract',
  other: 'Other',
};

const OU_LABELS: Record<OuTag, string> = {
  gda: 'GDA',
  envision: 'Envision',
  pds: 'PD Systems',
  riverstone: 'Riverstone',
};

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-muted">\u2014</span>;
  const colorMap: Record<string, string> = {
    A: 'text-accent',
    B: 'text-ink-primary',
    C: 'text-muted',
  };
  return <span className={`font-medium ${colorMap[grade] ?? 'text-muted'}`}>{grade}</span>;
}

const docColumns: TableColumn<KbDocument>[] = [
  {
    key: 'source_filename',
    header: 'Filename',
    render: (row) => (
      <span className="text-ink-primary font-medium">
        {row.source_url ? (
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {row.source_filename}
          </a>
        ) : (
          row.source_filename
        )}
      </span>
    ),
  },
  {
    key: 'doc_type',
    header: 'Type',
    width: 140,
    render: (row) => (
      <span className="text-ink-primary">{DOC_TYPE_LABELS[row.doc_type] ?? row.doc_type}</span>
    ),
  },
  {
    key: 'ou_tag',
    header: 'OU',
    width: 100,
    render: (row) => (
      <span className="text-ink-primary">
        {row.ou_tag ? OU_LABELS[row.ou_tag] ?? row.ou_tag : '\u2014'}
      </span>
    ),
  },
  {
    key: 'evidence_grade',
    header: 'Grade',
    width: 60,
    render: (row) => <GradeBadge grade={row.evidence_grade} />,
  },
  {
    key: 'chunk_count',
    header: 'Chunks',
    width: 80,
    align: 'right' as const,
    render: (row) => <span className="text-ink-primary nums">{row.chunk_count}</span>,
  },
  {
    key: 'uploaded_at',
    header: 'Uploaded',
    width: 120,
    render: (row) => <span className="text-muted">{formatDate(row.uploaded_at)}</span>,
  },
];

function SearchPanel() {
  const [query, setQuery] = useState('');
  const [ouFilter, setOuFilter] = useState<OuTag | ''>('');
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | ''>('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const filterOpts: { ou_filter?: OuTag; doc_type_filter?: DocType; top_k?: number } = {};
      if (ouFilter) filterOpts.ou_filter = ouFilter;
      if (docTypeFilter) filterOpts.doc_type_filter = docTypeFilter;
      const data = await searchRag(query, filterOpts);
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="Search the knowledge base\u2026"
          className="flex-1 h-8 px-3 text-body border border-border-default rounded bg-white text-ink-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={ouFilter}
          onChange={(e) => setOuFilter(e.target.value as OuTag | '')}
          className="h-8 px-2 text-caption border border-border-default rounded bg-white text-ink-primary"
        >
          <option value="">All OUs</option>
          {(Object.entries(OU_LABELS) as [OuTag, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value as DocType | '')}
          className="h-8 px-2 text-caption border border-border-default rounded bg-white text-ink-primary"
        >
          <option value="">All Types</option>
          {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <Button variant="primary" onClick={handleSearch} disabled={searching || !query.trim()}>
          {searching ? 'Searching\u2026' : 'Search'}
        </Button>
      </div>
      {results !== null && (
        <div className="flex flex-col gap-3">
          {results.length === 0 && (
            <p className="text-muted text-body">No results found.</p>
          )}
          {results.map((r) => (
            <div
              key={r.chunk_id}
              className="border border-border-default rounded p-4 bg-white"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-caption text-muted">
                  Score: {r.score.toFixed(3)}
                </span>
                <span className="text-caption text-muted">
                  {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
                </span>
                {r.evidence_grade && (
                  <span className="text-caption font-medium text-accent">
                    Grade {r.evidence_grade}
                  </span>
                )}
                {r.page_number && (
                  <span className="text-caption text-muted">p.{r.page_number}</span>
                )}
              </div>
              <p className="text-body text-ink-primary whitespace-pre-wrap leading-relaxed">
                {r.chunk_text}
              </p>
              <div className="mt-2 text-caption text-muted">
                {r.source_url ? (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {r.source_filename}
                  </a>
                ) : (
                  r.source_filename
                )}
                {r.section_title && <span> &middot; {r.section_title}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeBaseList() {
  const queryClient = useQueryClient();
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | ''>('');
  const [ouFilter, setOuFilter] = useState<OuTag | ''>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');

  const { data: status } = useQuery({
    queryKey: ['rag-status'],
    queryFn: fetchRagStatus,
    staleTime: 30_000,
  });

  const { data: documents, isLoading, isError, error } = useQuery({
    queryKey: ['rag-documents', docTypeFilter, ouFilter],
    queryFn: () => {
      const opts: { ou?: OuTag; doc_type?: DocType; limit?: number } = {};
      if (docTypeFilter) opts.doc_type = docTypeFilter;
      if (ouFilter) opts.ou = ouFilter;
      return fetchDocuments(opts);
    },
    staleTime: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      queryClient.invalidateQueries({ queryKey: ['rag-status'] });
      setConfirmDeleteId(null);
    },
  });

  const reingestMutation = useMutation({
    mutationFn: reingestDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      queryClient.invalidateQueries({ queryKey: ['rag-status'] });
    },
  });

  const columnsWithActions: TableColumn<KbDocument>[] = [
    ...docColumns,
    {
      key: 'actions',
      header: '',
      width: 180,
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reingestMutation.mutate(row.id)}
            disabled={reingestMutation.isPending}
          >
            Re-ingest
          </Button>
          {confirmDeleteId === row.id ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteMutation.mutate(row.id)}
              disabled={deleteMutation.isPending}
            >
              Confirm
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDeleteId(row.id)}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="knowledge-base-list">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Knowledge Base</h1>
        {status && (
          <div className="flex items-center gap-4 text-caption text-muted">
            <span>{status.documents} documents</span>
            <span>{status.chunks} chunks</span>
            <span>{status.embed_model}</span>
            <span>pgvector {status.pgvector_version}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className={`pb-1 text-body font-medium ${
            activeTab === 'documents'
              ? 'text-ink-primary border-b-2 border-accent'
              : 'text-muted'
          }`}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
        <button
          type="button"
          className={`pb-1 text-body font-medium ${
            activeTab === 'search'
              ? 'text-ink-primary border-b-2 border-accent'
              : 'text-muted'
          }`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
      </div>

      {activeTab === 'search' ? (
        <SearchPanel />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as DocType | '')}
              className="h-8 px-2 text-caption border border-border-default rounded bg-white text-ink-primary"
            >
              <option value="">All Types</option>
              {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={ouFilter}
              onChange={(e) => setOuFilter(e.target.value as OuTag | '')}
              className="h-8 px-2 text-caption border border-border-default rounded bg-white text-ink-primary"
            >
              <option value="">All OUs</option>
              {(Object.entries(OU_LABELS) as [OuTag, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {isError && <ErrorState title="Failed to load documents" description={(error as Error).message} onRetry={() => { queryClient.invalidateQueries({ queryKey: ['rag-documents'] }); }} />}

          {!isError && (
            <DataTable
              columns={columnsWithActions}
              data={documents ?? []}
              loading={isLoading}
              rowKey={(row) => row.id}
              emptyState={<EmptyState title="No documents ingested yet." />}
            />
          )}
        </>
      )}
    </div>
  );
}
