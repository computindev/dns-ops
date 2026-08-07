#!/usr/bin/env npx tsx
/**
 * Post-deploy smoke tests for the currently shipped DNS-only slice.
 */

const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const COLLECTOR_URL = process.env.COLLECTOR_URL || 'http://localhost:3001';
const TIMEOUT_MS = parseInt(process.env.SMOKE_TIMEOUT_MS || '10000', 10);

const args = process.argv.slice(2);
const webOnly = args.includes('--web-only');
const collectorOnly = args.includes('--collector-only');
const verbose = args.includes('--verbose') || args.includes('-v');

interface TestResult {
  name: string;
  service: 'web' | 'collector';
  passed: boolean;
  durationMs: number;
  error?: string;
  response?: { status: number; body?: unknown };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runTest(
  name: string,
  service: 'web' | 'collector',
  testFn: () => Promise<{
    passed: boolean;
    response?: { status: number; body?: unknown };
    error?: string;
  }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await testFn();
    return { name, service, ...result, durationMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      service,
      passed: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testWebHealth(): Promise<TestResult> {
  return runTest('Web Health Check', 'web', async () => {
    const response = await fetchWithTimeout(`${WEB_URL}/api/health`);
    const body = await response.json();
    return {
      passed: response.status === 200 && body.status === 'healthy',
      response: { status: response.status, body },
    };
  });
}

async function testWebHomepage(): Promise<TestResult> {
  return runTest('Web Homepage', 'web', async () => {
    const response = await fetchWithTimeout(WEB_URL);
    return {
      passed: response.status === 200,
      response: { status: response.status },
    };
  });
}

async function testCollectorHealth(
  path: '/health' | '/healthz' | '/readyz',
  expectedStatus: number
) {
  return runTest(`Collector ${path}`, 'collector', async () => {
    const response = await fetchWithTimeout(`${COLLECTOR_URL}${path}`);
    const body = await response.json().catch(() => undefined);
    // /readyz is readiness: dependency failure (503) is a smoke failure, not a pass.
    const passed = response.status === expectedStatus;
    let error: string | undefined;
    if (!passed) {
      if (path === '/readyz' && response.status === 503) {
        error = 'Collector not ready (dependency check failed)';
      } else {
        error = `Expected HTTP ${expectedStatus}, got ${response.status}`;
      }
    }

    return {
      passed,
      response: { status: response.status, body },
      error,
    };
  });
}

async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  if (!collectorOnly) {
    console.log('\n🌐 Testing Web Service...');
    console.log(`   URL: ${WEB_URL}\n`);
    results.push(await testWebHealth());
    results.push(await testWebHomepage());
  }

  if (!webOnly) {
    console.log('\n📡 Testing Collector Service...');
    console.log(`   URL: ${COLLECTOR_URL}\n`);
    results.push(await testCollectorHealth('/health', 200));
    results.push(await testCollectorHealth('/healthz', 200));
    results.push(await testCollectorHealth('/readyz', 200));
  }

  return results;
}

function printResults(results: TestResult[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('SMOKE TEST RESULTS');
  console.log('═'.repeat(70));

  const grouped = {
    web: results.filter((result) => result.service === 'web'),
    collector: results.filter((result) => result.service === 'collector'),
  };

  for (const [service, tests] of Object.entries(grouped)) {
    if (tests.length === 0) continue;

    console.log(`\n${service.toUpperCase()} SERVICE:`);
    for (const test of tests) {
      console.log(`  ${test.passed ? '✅' : '❌'} ${test.name} (${test.durationMs}ms)`);
      if (!test.passed && test.error) {
        console.log(`     Error: ${test.error}`);
      }
      if (verbose && test.response) {
        console.log(`     Status: ${test.response.status}`);
        if (test.response.body) {
          console.log(
            `     Body: ${JSON.stringify(test.response.body, null, 2).split('\n').join('\n     ')}`
          );
        }
      }
    }
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log('\n' + '─'.repeat(70));
  console.log(`${passed === total ? '✅' : '❌'} ${passed}/${total} tests passed`);

  if (passed !== total) {
    console.log('\nFailed tests:');
    for (const test of results.filter((result) => !result.passed)) {
      console.log(`  - ${test.name}: ${test.error || 'Unknown error'}`);
    }
  }

  console.log('═'.repeat(70));
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    DNS Ops Smoke Tests                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  if (webOnly) {
    console.log('\nMode: Web service only');
  } else if (collectorOnly) {
    console.log('\nMode: Collector service only');
  } else {
    console.log('\nMode: Full (web + collector)');
  }

  console.log(`Timeout: ${TIMEOUT_MS}ms`);

  const results = await runAllTests();
  printResults(results);
  process.exit(results.every((result) => result.passed) ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Fatal error running smoke tests:', error);
  process.exit(1);
});
