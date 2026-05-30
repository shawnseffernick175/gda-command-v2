import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';
import type { Plugin } from 'vite';

function tokenCompilerPlugin(): Plugin {
  const tokensPath = path.resolve(__dirname, 'design-tokens/tokens.json');
  const compile = () => {
    execSync('node scripts/compile-tokens.js', { cwd: __dirname, stdio: 'inherit' });
  };
  return {
    name: 'compile-tokens',
    buildStart() {
      compile();
    },
    configureServer(server) {
      server.watcher.add(tokensPath);
      server.watcher.on('change', (changedPath) => {
        if (changedPath === tokensPath) {
          compile();
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tokenCompilerPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/components': path.resolve(__dirname, 'src/components'),
      '@/stores': path.resolve(__dirname, 'src/stores'),
      '@/lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'echarts-for-react/lib/core'],
        },
      },
    },
  },
});
