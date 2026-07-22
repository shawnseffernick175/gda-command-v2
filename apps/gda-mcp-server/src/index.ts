import { createApp } from './server.js';
import { assertJwtSecret } from './middleware/auth.js';

const PORT = parseInt(process.env['MCP_PORT'] ?? '4100', 10);

// Fail fast: never boot a public MCP server without a properly configured
// JWT secret (no silent dev fallback).
assertJwtSecret();

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`gda-mcp-server listening on port ${PORT}`);
});
