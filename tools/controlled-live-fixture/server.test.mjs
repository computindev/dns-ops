import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createFixtureServer } from './server.mjs';

const apexHost = 'asorin.ai';
const wwwHost = 'www.asorin.ai';
const controlToken = randomBytes(32).toString('hex');

async function withFixture(run) {
  const server = createFixtureServer({ apexHost, wwwHost, controlToken });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

function request(baseUrl, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${baseUrl}${path}`, { method, headers }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text: () => responseBody,
        });
      });
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

test('healthy fixture redirects www and serves an indexable canonical apex page', async () => {
  await withFixture(async (baseUrl) => {
    const redirect = await request(baseUrl, '/', { headers: { host: wwwHost } });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `https://${apexHost}/`);

    const page = await request(baseUrl, '/', { headers: { host: apexHost } });
    assert.equal(page.status, 200);
    assert.equal(page.headers['x-robots-tag'], undefined);
    assert.match(page.text(), /rel="canonical" href="https:\/\/asorin.ai\/"/);
  });
});

test('control endpoint admits only an authenticated fixed mode and changes the expected surface', async () => {
  await withFixture(async (baseUrl) => {
    const denied = await request(baseUrl, '/__dnsops/live-mode', {
      method: 'POST',
      headers: { host: apexHost },
      body: JSON.stringify({ mode: 'redirect_fault' }),
    });
    assert.equal(denied.status, 404);

    const invalid = await request(baseUrl, '/__dnsops/live-mode', {
      method: 'POST',
      headers: { host: apexHost, authorization: `Bearer ${controlToken}` },
      body: JSON.stringify({ mode: 'arbitrary-content' }),
    });
    assert.equal(invalid.status, 400);

    const readHealthy = await request(baseUrl, '/__dnsops/live-mode', {
      headers: { host: apexHost, authorization: `Bearer ${controlToken}` },
    });
    assert.equal(readHealthy.status, 200);
    assert.deepEqual(JSON.parse(readHealthy.text()), { mode: 'healthy' });

    const setRedirectFault = await request(baseUrl, '/__dnsops/live-mode', {
      method: 'POST',
      headers: { host: apexHost, authorization: `Bearer ${controlToken}` },
      body: JSON.stringify({ mode: 'redirect_fault' }),
    });
    assert.equal(setRedirectFault.status, 200);
    assert.equal((await request(baseUrl, '/', { headers: { host: wwwHost } })).status, 200);
    const readRedirectFault = await request(baseUrl, '/__dnsops/live-mode', {
      headers: { host: apexHost, authorization: `Bearer ${controlToken}` },
    });
    assert.deepEqual(JSON.parse(readRedirectFault.text()), { mode: 'redirect_fault' });

    const setNoindexFault = await request(baseUrl, '/__dnsops/live-mode', {
      method: 'POST',
      headers: { host: apexHost, authorization: `Bearer ${controlToken}` },
      body: JSON.stringify({ mode: 'noindex_fault' }),
    });
    assert.equal(setNoindexFault.status, 200);
    const page = await request(baseUrl, '/', { headers: { host: apexHost } });
    assert.equal(page.headers['x-robots-tag'], 'noindex');
    assert.match(page.text(), /<meta name="robots" content="noindex">/);
  });
});
