// Minimal static file server for E2E tests.
// Serves the project root so /dist/assets/* and /e2e/* both resolve.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export async function startStaticServer(port = 0): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/e2e/netflix-mock.html';
      const filePath = join(ROOT, normalize(pathPath(pathname)));
      // Prevent path traversal
      if (!filePath.startsWith(ROOT)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actualPort,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function pathPath(p: string): string {
  return p.split('/').join(sep);
}
