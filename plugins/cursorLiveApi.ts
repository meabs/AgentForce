import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BRIDGE_PATH, PUBLIC_PATH, atomicWrite, normalize, readJson, writeLive } from '../scripts/lib/cursor-live.mjs';

const MAX_BODY = 16 * 1024;

function isLoopback(req: IncomingMessage) {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

/**
 * Dev/preview-only local endpoint:
 *   GET  /api/cursor-live  -> current public/cursor-live.json
 *   POST /api/cursor-live  -> merge JSON body into it (and the bridge file). Loopback only.
 * No external calls, no credentials.
 */
export function cursorLiveApi(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/cursor-live')) return next();
    if (req.method === 'GET') return send(res, 200, readJson(PUBLIC_PATH) ?? {});
    if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
    if (!isLoopback(req)) return send(res, 403, { error: 'loopback only' });

    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        send(res, 413, { error: 'body too large' });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return send(res, 400, { error: 'invalid JSON' });
      }
      const prev = readJson(PUBLIC_PATH) ?? {};
      const next = normalize({ ...(body as object), updatedAt: new Date().toISOString() }, prev);
      atomicWrite(BRIDGE_PATH, next);
      writeLive(next);
      send(res, 200, { ok: true, live: next });
    });
  };
  return {
    name: 'cursor-live-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
