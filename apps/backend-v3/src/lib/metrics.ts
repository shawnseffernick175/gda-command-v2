import client from 'prom-client';

export const register = new client.Registry();

register.setDefaultLabels({ app: 'backend-v3' });
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const analysisTimeoutCount = new client.Counter({
  name: 'analysis_timeout_count',
  help: 'Number of 503 ANALYSIS_TIMEOUT responses',
  registers: [register],
});

export const analysisCacheHits = new client.Counter({
  name: 'analysis_cache_hits',
  help: 'Number of requests served from fresh analysis cache',
  registers: [register],
});

export const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Current depth of pg-boss queues',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const fastTrackAssessmentsCompleted = new client.Counter({
  name: 'fast_track_assessments_completed_total',
  help: 'Total fast track assessments completed',
  labelNames: ['grade', 'recommended_action'] as const,
  registers: [register],
});

export const fastTrackAssessmentDuration = new client.Histogram({
  name: 'fast_track_assessment_duration_seconds',
  help: 'Duration of fast track assessment processing',
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register],
});

export const fastTrackCacheHits = new client.Counter({
  name: 'fast_track_cache_hits',
  help: 'Number of fast track requests served from cache',
  registers: [register],
});

export const fastTrackTimeoutCount = new client.Counter({
  name: 'fast_track_timeout_count',
  help: 'Number of fast track 503 ANALYSIS_TIMEOUT responses',
  registers: [register],
});
