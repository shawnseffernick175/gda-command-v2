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
