import { createApp } from './server.js';

const PORT = parseInt(process.env['MCP_PORT'] ?? '4100', 10);

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`gda-mcp-server listening on port ${PORT}`);
});
