import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORT = 3000;
const PYTHON_PORT = 8000;
const BACKEND_DIR = path.resolve(process.cwd(), 'backend');

let pythonProcess: ChildProcess | null = null;
let pythonReady = false;

function startPythonBackend() {
  try {
    pythonProcess = spawn('python3', ['-m', 'app.main', '--host', '127.0.0.1', '--port', String(PYTHON_PORT)], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PYTHONPATH: BACKEND_DIR },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('listening')) {
        pythonReady = true;
      }
    });

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const errMsg = data.toString().trim();
      if (errMsg) {
        console.error('[Python Backend]', errMsg);
      }
    });

    pythonProcess.on('exit', () => {
      pythonReady = false;
    });
  } catch (err) {
    console.error('Failed to spawn persistent Python backend:', err);
  }
}

/**
 * Execute an API call against the running Python HTTP backend on port 8000,
 * or synchronously via python3 one-shot bridge if the daemon is still warming up.
 */
async function callPythonBackend(
  method: string,
  apiPath: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  if (pythonReady) {
    try {
      const response = await fetch(`http://127.0.0.1:${PYTHON_PORT}${apiPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { status: response.status, data };
    } catch {
      // Fall through to synchronous python3 bridge if socket connection transiently fails
    }
  }

  // Synchronous bridge to the exact same Python backend router
  try {
    const pyScript = `
import sys, json
from app.api.routes import handle_api_request
method = sys.argv[1]
path = sys.argv[2]
raw_body = sys.argv[3] if len(sys.argv) > 3 else ""
body = json.loads(raw_body) if raw_body else None
status, payload = handle_api_request(method, path, body)
print(json.dumps({"status": status, "data": payload}))
`;
    const bodyArg = body !== undefined ? JSON.stringify(body) : '';
    const stdout = execFileSync('python3', ['-c', pyScript, method, apiPath, bodyArg], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PYTHONPATH: BACKEND_DIR },
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
    const lines = stdout.trim().split('\n');
    const parsed = JSON.parse(lines[lines.length - 1]);
    return { status: parsed.status, data: parsed.data };
  } catch (err) {
    return {
      status: 500,
      data: {
        error: 'Python Backend Execution Error',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function startServer() {
  startPythonBackend();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', async (_req, res) => {
    const result = await callPythonBackend('GET', '/api/health');
    res.status(result.status).json(result.data);
  });

  app.get('/api/model', async (_req, res) => {
    const result = await callPythonBackend('GET', '/api/model');
    res.status(result.status).json(result.data);
  });

  app.get('/api/history', async (_req, res) => {
    const result = await callPythonBackend('GET', '/api/history');
    res.status(result.status).json(result.data);
  });

  app.post('/api/schedule', async (req, res) => {
    const result = await callPythonBackend('POST', '/api/schedule', req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/simulation', async (req, res) => {
    const result = await callPythonBackend('POST', '/api/simulation', req.body);
    res.status(result.status).json(result.data);
  });

  app.get('/api/docs/:docName', (req, res) => {
    const allowedDocs: Record<string, string> = {
      readme: 'README.md',
      architecture: 'ARCHITECTURE.md',
      model_report: 'MODEL_REPORT.md',
    };
    const fileName = allowedDocs[req.params.docName.toLowerCase()];
    if (!fileName) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const fullPath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: `${fileName} not found` });
      return;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ name: fileName, content });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ORBITAL Mission Control Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
