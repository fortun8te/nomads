import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import path from 'path'

/**
 * Auto-start companion servers when Vite dev server starts.
 * Checks if each server is already running before spawning.
 */
function autoStartServers() {
  let started = false;
  return {
    name: 'auto-start-servers',
    configureServer() {
      if (started) return;
      started = true;

      // Auto-start Freepik server (port 8890)
      tryStartServer({
        name: 'Freepik',
        port: 8890,
        healthUrl: 'http://localhost:8890/api/status',
        command: '/opt/homebrew/bin/python3.11 -m uvicorn freepik_server:app --host 0.0.0.0 --port 8890',
        cwd: process.cwd(),
      });
    },
  };
}

async function tryStartServer(opts: {
  name: string;
  port: number;
  healthUrl: string;
  command: string;
  cwd: string;
}) {
  try {
    // Check if already running
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(opts.healthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      console.log(`\x1b[32m✓\x1b[0m ${opts.name} server already running on port ${opts.port}`);
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log(`\x1b[33m⟳\x1b[0m Starting ${opts.name} server on port ${opts.port}...`);
  const child = exec(opts.command, { cwd: opts.cwd });

  child.stdout?.on('data', (data: string) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.includes('Uvicorn running') || line.includes('Application startup')) {
        console.log(`\x1b[32m✓\x1b[0m ${opts.name} server started on port ${opts.port}`);
      }
    }
  });

  child.stderr?.on('data', (data: string) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      // Uvicorn logs to stderr by default
      if (line.includes('Uvicorn running') || line.includes('Application startup')) {
        console.log(`\x1b[32m✓\x1b[0m ${opts.name} server started on port ${opts.port}`);
      } else if (line.includes('ERROR') || line.includes('ModuleNotFoundError')) {
        console.error(`\x1b[31m✗\x1b[0m ${opts.name}: ${line}`);
      }
    }
  });

  child.on('error', (err) => {
    console.error(`\x1b[31m✗\x1b[0m Failed to start ${opts.name}: ${err.message}`);
  });

  // Don't let the child process keep Node alive
  child.unref();
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), autoStartServers()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
  },
  optimizeDeps: {
    exclude: ['@novnc/novnc'],
  },
})
