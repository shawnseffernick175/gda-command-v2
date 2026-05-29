import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { errorEnvelope } from '../lib/envelope.js';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

const PUBLIC_PATHS = new Set([
  '/v3/health',
  '/v3/ready',
  '/v3/version',
  '/v3/metrics',
  '/v3/openapi.yaml',
  '/v3/docs',
  '/v3/docs/',
]);

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith('/v3/docs/')) return true;
  return false;
}

function isWebhookPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path.startsWith('/v3/webhooks/');
}

export function authHook(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const url = req.url;

  if (isPublicPath(url)) {
    done();
    return;
  }

  if (isWebhookPath(url)) {
    done();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    void reply.status(401).send(
      errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId)
    );
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: [config.jwtAlgorithm],
    }) as JwtPayload;
    (req as FastifyRequest & { user: JwtPayload }).user = decoded;
    req.log = req.log.child({ userId: decoded.sub });
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token expired'
        : 'Missing or invalid authorization';
    void reply.status(401).send(
      errorEnvelope('UNAUTHORIZED', message, req.requestId)
    );
    return;
  }

  done();
}

export function verifyWebhookHmac(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const signature = req.headers['x-gda-signature'];
  if (typeof signature !== 'string' || signature.length === 0) {
    const keyHeader = req.headers['x-gda-key'];
    if (typeof keyHeader === 'string' && keyHeader.length > 0) {
      if (keyHeader === config.webhookKey) {
        done();
        return;
      }
    }
    void reply.status(401).send(
      errorEnvelope('WEBHOOK_AUTH_FAILED', 'Invalid or missing webhook authentication', req.requestId)
    );
    return;
  }

  const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    void reply.status(401).send(
      errorEnvelope('WEBHOOK_AUTH_FAILED', 'Unable to verify signature: missing body', req.requestId)
    );
    return;
  }

  const expected = createHmac('sha256', config.webhookKey)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expected, 'utf-8');

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    void reply.status(401).send(
      errorEnvelope('WEBHOOK_AUTH_FAILED', 'HMAC signature verification failed', req.requestId)
    );
    return;
  }

  done();
}
