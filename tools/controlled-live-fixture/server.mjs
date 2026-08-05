import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const modes = new Set(['healthy', 'redirect_fault', 'noindex_fault']);
const controlPath = '/__dnsops/live-mode';

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseHostname(host) {
  return host?.split(':', 1)[0]?.toLowerCase();
}

function bearerMatches(request, expected) {
  const supplied = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

async function readControlRequest(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 512) throw new Error('control request is too large');
  }
  const parsed = JSON.parse(body);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !modes.has(parsed.mode)
  ) {
    throw new Error('control request must contain one permitted mode');
  }
  return parsed.mode;
}

function html({ noindex, canonicalUrl }) {
  const robots = noindex ? '<meta name="robots" content="noindex">' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${robots}<link rel="canonical" href="${canonicalUrl}"><title>DNS Ops live fixture</title></head><body>DNS Ops live fixture</body></html>`;
}

export function createFixtureServer({ apexHost, wwwHost, controlToken }) {
  let mode = 'healthy';
  const canonicalUrl = `https://${apexHost}/`;

  return createServer(async (request, response) => {
    const hostname = parseHostname(request.headers.host);
    if (hostname !== apexHost && hostname !== wwwHost) {
      response.writeHead(421).end();
      return;
    }

    if (request.url === controlPath) {
      if (!bearerMatches(request, controlToken)) {
        response.writeHead(404).end();
        return;
      }
      if (request.method === 'GET') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ mode }));
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(404).end();
        return;
      }
      try {
        mode = await readControlRequest(request);
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ mode }));
      } catch {
        response.writeHead(400).end();
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD, POST' }).end();
      return;
    }

    if (request.headers['x-forwarded-proto'] === 'http') {
      response.writeHead(308, { location: canonicalUrl, 'cache-control': 'no-store' }).end();
      return;
    }

    if (hostname === wwwHost && mode !== 'redirect_fault') {
      response.writeHead(308, { location: canonicalUrl, 'cache-control': 'no-store' }).end();
      return;
    }

    const noindex = mode === 'noindex_fault';
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(noindex ? { 'x-robots-tag': 'noindex' } : {}),
    });
    if (request.method === 'HEAD') response.end();
    else response.end(html({ noindex, canonicalUrl }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apexHost = requiredEnvironment('DNSOPS_FIXTURE_APEX_HOST');
  const wwwHost = requiredEnvironment('DNSOPS_FIXTURE_WWW_HOST');
  const controlToken = requiredEnvironment('DNSOPS_FIXTURE_CONTROL_TOKEN');
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid port');
  createFixtureServer({ apexHost, wwwHost, controlToken }).listen(port);
}
