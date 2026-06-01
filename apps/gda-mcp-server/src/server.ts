import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireBearerJwt } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadVersion(): string {
  try {
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const VERSION = loadVersion();

interface McpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

function createMcpServer(): Server {
  const server = new Server(
    { name: 'gda-mcp', version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [] };
  });

  return server;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, McpSession>();

  // Health check — no auth
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gda-mcp', version: VERSION });
  });

  // MCP POST — requires Bearer JWT
  app.post('/mcp', requireBearerJwt, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    const server = createMcpServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    const sid = transport.sessionId;
    if (sid && !sessions.has(sid)) {
      sessions.set(sid, { server, transport });
    }
  });

  // MCP GET for SSE stream (server-to-client notifications)
  app.get('/mcp', requireBearerJwt, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // MCP DELETE for session termination
  app.delete('/mcp', requireBearerJwt, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  return app;
}
