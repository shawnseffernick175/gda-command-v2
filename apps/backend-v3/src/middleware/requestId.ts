import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export function requestIdHook(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();

  req.requestId = id;
  void reply.header('x-request-id', id);
  req.log = req.log.child({ requestId: id });
  done();
}
