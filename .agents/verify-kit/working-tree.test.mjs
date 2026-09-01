/**
 * Regression tests for exact working-tree digests: tolerate the intentional
 * unborn `.pi/self-learning-memory` gitlink, track valid gitlink pointers, and
 * fail closed when any other gitlink cannot be staged.
 *
 * Run: node --test .agents/verify-kit/working-tree.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const KIT = fileURLToPath(new URL('./verify.mjs', import.meta.url));

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function verifyKit(cwd, args) {
  return spawnSync(process.execPath, [KIT, ...args], { cwd, encoding: 'utf8' });
}

function digestFrom(output) {
  const m = output.match(/code_digest `([0-9a-f]+)`/);
  assert.ok(m, `no code_digest in output:\n${output}`);
  return m[1];
}

test('check-commit --working-tree handles memory links, tracks pointers, and fails closed', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-kit-wt-'));
  const memory = path.join(repo, '.pi', 'self-learning-memory');
  const embedded = path.join(repo, 'embedded');
  try {
    // A repo with one tracked product file.
    git(repo, ['init', '--quiet']);
    git(repo, ['config', 'user.email', 't@example.com']);
    git(repo, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v1\n');
    git(repo, ['add', 'code.ts']);
    git(repo, ['commit', '--quiet', '-m', 'init']);

    // The memory gitlink has an unborn HEAD and is the one intentional
    // exception. A sibling gitlink has a valid pointer and must remain in the
    // temporary index so pointer changes affect the digest.
    fs.mkdirSync(memory, { recursive: true });
    git(memory, ['init', '--quiet']);
    git(memory, ['config', 'user.email', 't@example.com']);
    git(memory, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(memory, 'CORE.md'), 'memory\n');
    git(memory, ['add', 'CORE.md']);
    git(memory, ['commit', '--quiet', '-m', 'memory init']);

    fs.mkdirSync(embedded, { recursive: true });
    git(embedded, ['init', '--quiet']);
    git(embedded, ['config', 'user.email', 't@example.com']);
    git(embedded, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(embedded, 'README.md'), 'embedded v1\n');
    git(embedded, ['add', 'README.md']);
    git(embedded, ['commit', '--quiet', '-m', 'embedded init']);

    git(repo, ['add', '.pi/self-learning-memory', 'embedded']);
    git(repo, ['commit', '--quiet', '-m', 'track gitlinks']);
    git(memory, ['update-ref', '-d', `refs/heads/${git(memory, ['branch', '--show-current'])}`]);
    assert.match(git(repo, ['status', '--porcelain']), /\.pi\/self-learning-memory/);

    // Unstaged product change: the working tree differs from HEAD.
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v2\n');

    // Before the fix, `git add -A` aborted on the gitlink, workingTree() was
    // null and check-commit exited 0 with no output at all.
    const first = verifyKit(repo, ['check-commit', '--working-tree']);
    assert.equal(first.status, 0, first.stderr);
    const digest1 = digestFrom(first.stdout);

    // The digest must track the working tree, not fall back to HEAD's tree.
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v3\n');
    const second = verifyKit(repo, ['check-commit', '--working-tree']);
    assert.equal(second.status, 0, second.stderr);
    const digest2 = digestFrom(second.stdout);
    assert.notEqual(digest1, digest2, 'code_digest did not change with the working tree');

    // A valid gitlink pointer is also part of the digest, despite being
    // unchanged in the parent index.
    fs.writeFileSync(path.join(embedded, 'README.md'), 'embedded v2\n');
    git(embedded, ['add', 'README.md']);
    git(embedded, ['commit', '--quiet', '-m', 'embedded update']);
    const third = verifyKit(repo, ['check-commit', '--working-tree']);
    assert.equal(third.status, 0, third.stderr);
    const digest3 = digestFrom(third.stdout);
    assert.notEqual(digest2, digest3, 'code_digest ignored a valid gitlink pointer change');

    // A second unborn gitlink is not the intentional memory exception. The
    // exact-tree digest must fail closed rather than fall back to HEAD.
    const broken = path.join(repo, 'broken');
    fs.mkdirSync(broken, { recursive: true });
    git(broken, ['init', '--quiet']);
    git(broken, ['config', 'user.email', 't@example.com']);
    git(broken, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(broken, 'README.md'), 'broken v1\n');
    git(broken, ['add', 'README.md']);
    git(broken, ['commit', '--quiet', '-m', 'broken init']);
    git(repo, ['add', 'broken']);
    git(repo, ['commit', '--quiet', '-m', 'track broken gitlink']);
    git(broken, ['update-ref', '-d', `refs/heads/${git(broken, ['branch', '--show-current'])}`]);
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v4\n');

    const failed = verifyKit(repo, ['check-commit', '--working-tree']);
    assert.notEqual(failed.status, 0, 'unexpected gitlink failure passed open');
    assert.match(
      `${failed.stdout}${failed.stderr}`,
      /could not construct exact working-tree digest/,
      'failure did not explain that exact-tree digesting was refused'
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
