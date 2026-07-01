/**
 * Universal Ingestion service — F-304.
 */

export { detectPii, redactPii, fullRedact } from './pii.js';
export { classifyDocument, type ClassificationResult } from './classifier.js';
export { routeToSurface, type RouteResult } from './router.js';
