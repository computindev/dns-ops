/**
 * Regression tests for exact working-tree digests: tolerate the intentional
 * `.pi/self-learning-memory` gitlink, track valid gitlink pointers, and fail
 * closed when temporary-index staging fails.
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

function verifyKit(cwd, args, env = {}) {
  return spawnSync(process.execPath, [KIT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function failingGitWrapper() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-kit-git-'));
  const realPath = process.env.PATH;
  assert.ok(realPath, 'PATH is required to delegate non-failing git commands');
  const wrapper = path.join(dir, 'git');
  fs.writeFileSync(wrapper, `#!/bin/sh
if [ "$VERIFY_KIT_FAIL_TEMP_INDEX_ADD" = "1" ] &&
   [ -n "$GIT_INDEX_FILE" ] &&
   [ "$1" = "add" ] &&
   [ "$2" = "-A" ]; then
  echo "controlled temp-index git add failure" >&2
  exit 97
fi
PATH="$VERIFY_KIT_REAL_PATH"
export PATH
exec git "$@"
`);
  fs.chmodSync(wrapper, 0o755);
  return {
    dir,
    env: {
      PATH: `${dir}${path.delimiter}${realPath}`,
      VERIFY_KIT_REAL_PATH: realPath,
      VERIFY_KIT_FAIL_TEMP_INDEX_ADD: '1',
    },
  };
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
  let wrapperDir;
  try {
    // A repo with one tracked product file.
    git(repo, ['init', '--quiet']);
    git(repo, ['config', 'user.email', 't@example.com']);
    git(repo, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v1\n');
    git(repo, ['add', 'code.ts']);
    git(repo, ['commit', '--quiet', '-m', 'init']);

    // The memory gitlink is the one intentional excluded path. A sibling
    // gitlink has a valid pointer and must remain in the temporary index so
    // pointer changes affect the digest.
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

    // Unstaged product change: the working tree differs from HEAD.
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v2\n');

    // Before the fix, a failed temp-index `git add -A` made workingTree()
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

    // A temp-index git add failure must fail closed rather than fall back to
    // HEAD. Simulate that command failure directly so this assertion does not
    // depend on Git's nested-repository status semantics.
    fs.writeFileSync(path.join(repo, 'code.ts'), 'v4\n');
    const wrapper = failingGitWrapper();
    wrapperDir = wrapper.dir;
    const failed = verifyKit(repo, ['check-commit', '--working-tree'], wrapper.env);
    assert.notEqual(failed.status, 0, 'unexpected temp-index failure passed open');
    assert.match(
      `${failed.stdout}${failed.stderr}`,
      /could not construct exact working-tree digest/,
      'failure did not explain that exact-tree digesting was refused'
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    if (wrapperDir) fs.rmSync(wrapperDir, { recursive: true, force: true });
  }
});
