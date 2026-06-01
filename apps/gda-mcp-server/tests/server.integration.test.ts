import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['MCP_PORT'] = '0';

const { createApp } = await import('../src/server.js');

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  server = app.listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function makeToken(payload: Record<string, unknown> = {}, secret = 'test-jwt-secret'): string {
  return jwt.sign(
    { sub: 'test-user', email: 'test@gda.local', ...payload },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

describe('Health endpoint', () => {
  it('GET /health returns 200 with expected JSON', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gda-mcp');
    expect(typeof body.version).toBe('string');
  });
});

describe('MCP endpoint auth', () => {
  it('returns 401 for missing Bearer token on POST /mcp', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid JWT on POST /mcp', async () => {
    const badToken = makeToken({}, 'wrong-secret');
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${badToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired JWT on POST /mcp', async () => {
    const expiredToken = jwt.sign(
      { sub: 'test-user' },
      'test-jwt-secret',
      { algorithm: 'HS256', expiresIn: '-10s' },
    );
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
    });
    expect(res.status).toBe(401);
  });
});

describe('MCP tools/list', () => {
  it('returns empty tools list with valid JWT via MCP client', async () => {
    const token = makeToken();
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: { 'Authorization': `Bearer ${token}` },
      },
    });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools).toEqual([]);
    await client.close();
  });
});
