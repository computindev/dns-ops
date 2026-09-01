/**
 * Regression test: workingTree() must tolerate a tracked gitlink whose embedded
 * repository has no commit checked out (e.g. `.pi/self-learning-memory` in a
 * local worktree). `git add -A` on the temp index aborts on such a gitlink,
 * which used to make workingTree() return null and silently bind receipts to
 * HEAD's digest instead of the verified tree.
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

test('check-commit --working-tree digests the working tree despite an unborn-HEAD gitlink', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-kit-wt-'));
  const memory = path.join(repo, '.pi', 'self-learning-memory');
  try {
    // A repo with one tracked product file.
    git(repo, ['init', '--quiet']);
    git(repo, ['config', 'user.email', 't@example.com']);
    git(repo, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v1\n');
    git(repo, ['add', 'code.ts']);
    git(repo, ['commit', '--quiet', '-m', 'init']);

    // A tracked gitlink: commit once inside the embedded repo so the parent can
    // record the gitlink, then drop that commit so HEAD is unborn (the state a
    // worktree with .pi/self-learning-memory materialized but empty of commits).
    fs.mkdirSync(memory, { recursive: true });
    git(memory, ['init', '--quiet']);
    git(memory, ['config', 'user.email', 't@example.com']);
    git(memory, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(memory, 'CORE.md'), 'memory\n');
    git(memory, ['add', 'CORE.md']);
    git(memory, ['commit', '--quiet', '-m', 'memory init']);
    git(repo, ['add', '.pi/self-learning-memory']);
    git(repo, ['commit', '--quiet', '-m', 'track memory gitlink']);
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
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
