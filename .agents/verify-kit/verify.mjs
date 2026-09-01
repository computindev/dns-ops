#!/usr/bin/env node
/**
 * verify-kit CLI — zero dependencies, Node >= 18. Deterministic: never calls a model.
 *
 * The feature map (.agents/skills/verify-<app>/features/*.md frontmatter) is the single
 * source of truth for feature ids, profiles and impact paths. Receipts are Markdown files
 * with flat frontmatter, bound to a code_digest of the exact tree that was verified.
 *
 * Commands
 *   policy-init  [--app name]                       write verification/policy.json if missing
 *   features     [--json]                           list mapped features (+policy when --json; used by the pi extension)
 *   arm          --features a,b [--task ".."]       add features to the pending task (creates it if absent); idempotent
 *   start        --features a,b [--profile p] [--task "..."] | --auto [--base main]
 *   pause        --reason ".."                      let the agent stop to ask the user; hook stays armed
 *   resume | cancel                                 re-arm / drop the pending task
 *   run-new      [--label x]                        create verification/runs/<run_id>/ + env.txt, print run_id
 *   receipt      --run <id> --feature <id> --status <s> [--reason ".."] [--verifier builder|fresh]
 *                [--session ".."] [--surface s] [--profile p] [--notes-file f]
 *   status       [--json]                           pending task vs receipts for the current tree (no side effects)
 *   settle       [--json]                           harness hook core: exit 0 ok/none, 3 pending (message), 4 capped
 *   check-hook                                      Claude Code Stop hook (stdin JSON). exit 2 = block
 *   check-commit [--staged|--working-tree|--auto]   commit gate: staged (git hook) / working tree / auto (tool-call gates). exit 1 = block
 *   check-ci     --base <sha> --head <sha>          PR gate. exit 1 = not eligible for a merge decision
 *   report       [--sha <sha>]                      what is proven for the code tree at a sha
 *   registry     [--write]                          extract data-action-id / data-state / routes / CLI commands from product source
 *   lint-map     [--fresh]                          feature files + harness vs registry: unknown selectors/routes = error; dead path globs; coverage
 *   lint-selectors [dir ...]                        flag fragile selectors / sleeps / coordinate clicks
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const STATUSES = ['passed', 'failed', 'blocked', 'unreachable', 'not_applicable'];
const PROFILE_ORDER = ['quick', 'changed', 'critical', 'release'];

const ROOT = findRoot(process.cwd());
const V = (...p) => path.join(ROOT, 'verification', ...p);
const POLICY_PATH = V('policy.json');
const RECEIPTS_DIR = V('receipts');
const RUNS_DIR = V('runs');
const PENDING_PATH = V('pending.json');
const COUNTER_PATH = V('.hook-blocks');

const DEFAULT_POLICY = {
  version: 'verification-policy/v0',
  app: null,
  skill: null,
  quick_paths: ['**/*.md', 'docs/**', '.github/**', 'LICENSE', '**/*.txt', '.gitignore', '.agents/verify-kit/**', '.agents/skills/*/references/**', '.claude/**', '.cursor/**', '.pi/**', 'verification/**', '.githooks/**'],
  digest_ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/.next/**', '**/.wrangler/**', '**/.cache/**'],
  unmapped: 'warn',
  scope: { mapped: 'expand', unmapped: 'warn' },
  hook: { max_blocks: 5 },
  profiles: {
    quick: { accept: [], verifier: 'none' },
    changed: { accept: ['passed', 'blocked', 'unreachable', 'not_applicable'], verifier: 'builder' },
    critical: { accept: ['passed'], verifier: 'fresh' },
    release: { accept: ['passed'], verifier: 'fresh' },
  },
};

// ---------------------------------------------------------------- io (sync writes: pipes are async on macOS, exit() would truncate)
const wr = (fd, s) => { try { fs.writeSync(fd, s.endsWith('\n') ? s : s + '\n'); } catch (e) { if (e.code !== 'EPIPE') throw e; } };
const out = (s) => wr(1, s);
const err = (s) => wr(2, s);
const die = (m, code = 1) => { err(`verify: ${m}`); process.exit(code); };
const warn = (m) => err(`verify: warning: ${m}`);

// ---------------------------------------------------------------- utils
function findRoot(dir) {
  let d = dir;
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const p = path.dirname(d);
    if (p === d) return dir;
    d = p;
  }
}
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) o[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[a.slice(2)] = argv[++i];
      else o[a.slice(2)] = true;
    } else o._.push(a);
  }
  return o;
}
const need = (f, k) => (f[k] === undefined || f[k] === true ? die(`--${k} is required`) : String(f[k]));
const nowIso = () => new Date().toISOString();
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
function loadPolicy() {
  const u = readJson(POLICY_PATH, {});
  return { ...DEFAULT_POLICY, ...u, profiles: { ...DEFAULT_POLICY.profiles, ...(u.profiles || {}) }, hook: { ...DEFAULT_POLICY.hook, ...(u.hook || {}) }, scope: { ...DEFAULT_POLICY.scope, ...(u.scope || {}) } };
}
function git(a, { allowFail = false, env } = {}) {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  if (r.status !== 0) { if (allowFail) return null; die(`git ${a.join(' ')} failed: ${(r.stderr || '').trim()}`); }
  return r.stdout.trim();
}
const headSha = () => git(['rev-parse', 'HEAD'], { allowFail: true }) || 'NO-GIT';
const refExists = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true }) !== null;
const isDirty = () => (git(['status', '--porcelain', '--untracked-files=no'], { allowFail: true }) || '').length > 0;
const untrackedCount = () => (git(['ls-files', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n').filter(Boolean).length;
function changedFiles(base, head) {
  const three = git(['diff', '--name-only', `${base}...${head}`], { allowFail: true });
  const o = three !== null ? three : git(['diff', '--name-only', base, head]);
  return o.split('\n').map((s) => s.trim()).filter(Boolean);
}
/** Tree object of the current working tree (tracked + untracked-not-ignored), via a temp index.
 *  The self-learning-memory gitlink may have no checked-out commit, so it is
 *  the sole path excluded from temporary-index staging. Every other gitlink
 *  must either stage its pointer or make digest construction fail. */
function workingTree() {
  const tmp = path.join(os.tmpdir(), `verify-index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: tmp };
  const memoryGitlink = '.pi/self-learning-memory';
  try {
    if (refExists('HEAD') && git(['read-tree', 'HEAD'], { allowFail: true, env }) === null) {
      die('could not construct exact working-tree digest: git read-tree failed');
    }
    if (git(['add', '-A', '--', '.', `:(exclude)${memoryGitlink}`], { allowFail: true, env }) === null) {
      die('could not construct exact working-tree digest: git add failed');
    }
    const tree = git(['write-tree'], { allowFail: true, env });
    if (tree === null) die('could not construct exact working-tree digest: git write-tree failed');
    return tree;
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
/** Tree object of what a commit would contain right now (the real index). */
const indexTree = () => git(['write-tree'], { allowFail: true });
/** Digest of a code tree (commit or tree object), excluding verification/receipts/ and policy paths.
 *  Valid gitlink pointers remain digest inputs; only the local memory gitlink is excluded. */
function codeDigest(ref, policy) {
  if (!ref || ref === 'NO-GIT') return 'NO-GIT';
  const o = git(['ls-tree', '-r', ref], { allowFail: true });
  if (o === null) return 'NO-GIT';
  const keep = o.split('\n').filter((l) => {
    const p = l.split('\t')[1];
    const isGitlink = l.startsWith('160000 ');
    const isMemoryGitlink = p === '.pi/self-learning-memory';
    return p && !isMemoryGitlink && !p.startsWith('verification/receipts/') &&
      (isGitlink || (!matchAny(p, policy.quick_paths) && !matchAny(p, policy.digest_ignore)));
  });
  return crypto.createHash('sha256').update(keep.join('\n')).digest('hex');
}
function unquote(v) {
  v = v.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((s) => unquote(s)).filter(Boolean);
  return v;
}
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const o = {};
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && listKey) { o[listKey].push(unquote(li[1])); continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === '') { o[k] = []; listKey = k; } else { o[k] = unquote(v); listKey = null; }
  }
  return o;
}
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\/'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
const matchAny = (file, globs) => (globs || []).some((g) => globToRegex(g).test(file));
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function walk(dir) {
  const o = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) o.push(...walk(p)); else o.push(p);
  }
  return o.sort();
}
const rankProfile = (p) => Math.max(0, PROFILE_ORDER.indexOf(p));
const maxProfile = (list) => list.reduce((a, b) => (rankProfile(b) > rankProfile(a) ? b : a), 'quick');
function readStdinJson() {
  try { if (process.stdin.isTTY) return {}; return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

// ---------------------------------------------------------------- feature map
function featuresDir(policy) {
  if (policy.skill) return path.join(ROOT, policy.skill, 'features');
  const base = path.join(ROOT, '.agents', 'skills');
  if (!fs.existsSync(base)) return null;
  const c = fs.readdirSync(base).filter((n) => n.startsWith('verify-'));
  if (c.length === 1) return path.join(base, c[0], 'features');
  if (c.length > 1) die(`several verify-* skills under .agents/skills (${c.join(', ')}); set "skill" in verification/policy.json`);
  return null;
}
function loadFeatures(policy) {
  const dir = featuresDir(policy);
  if (!dir || !fs.existsSync(dir)) return [];
  const o = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'README.md')) {
    const fm = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!fm.id) { warn(`features/${f} has no "id" in frontmatter; ignored`); continue; }
    if (fm.profile && !PROFILE_ORDER.includes(fm.profile)) warn(`features/${f}: unknown profile "${fm.profile}"`);
    o.push({ id: fm.id, surface: fm.surface || 'unknown', profile: fm.profile || 'changed', paths: fm.paths || [], always_with: fm.always_with || [], file: path.relative(ROOT, path.join(dir, f)) });
  }
  return o;
}
function affectedFeatures(files, features) {
  const byId = new Map(features.map((f) => [f.id, f]));
  const hit = new Set(features.filter((f) => files.some((x) => matchAny(x, f.paths))).map((f) => f.id));
  const q = [...hit];
  while (q.length) { const f = byId.get(q.pop()); for (const w of f?.always_with || []) if (byId.has(w) && !hit.has(w)) { hit.add(w); q.push(w); } }
  return [...hit].map((id) => byId.get(id));
}

// ---------------------------------------------------------------- receipts
function loadReceipts() {
  if (!fs.existsSync(RECEIPTS_DIR)) return [];
  return fs.readdirSync(RECEIPTS_DIR).filter((n) => n.endsWith('.md')).map((n) => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(RECEIPTS_DIR, n), 'utf8'));
    return { ...fm, file: path.join('verification', 'receipts', n) };
  }).filter((r) => r.feature_id && r.status);
}
const latest = (rs) => rs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).pop();

/** Digest-based evaluation shared by hook, pre-commit and CI. strict=true (CI/commit) rejects builder receipts on critical. */
function evaluate({ feats, receipts, policy, digest, strict }) {
  return feats.map((f) => {
    const profile = f.profile || 'changed';
    const accept = policy.profiles[profile]?.accept ?? STATUSES.filter((s) => s !== 'failed');
    const mine = receipts.filter((r) => r.feature_id === f.id);
    const r = latest(mine.filter((x) => x.code_digest === digest));
    const res = { id: f.id, profile, receipt: r, ok: false, why: '', note: '' };
    if (!r) {
      const other = latest(mine);
      res.why = other
        ? `no receipt for this exact code tree (latest receipt ${other.file} is for code_digest ${String(other.code_digest).slice(0, 12)}, current is ${digest.slice(0, 12)} — code, harness or stray untracked files changed after it was verified)`
        : 'no receipt';
      return res;
    }
    if (!accept.includes(r.status)) { res.why = `status "${r.status}" is not accepted for profile "${profile}" (accepts: ${accept.join(', ') || 'nothing'})`; return res; }
    if (r.status !== 'passed' && !String(r.reason || '').trim()) { res.why = `status "${r.status}" requires a reason`; return res; }
    if (['critical', 'release'].includes(profile) && r.verifier !== 'fresh') {
      if (strict) { res.why = `profile "${profile}" requires verifier: fresh (got "${r.verifier || 'none'}") — run verify-fresh at this exact tree`; return res; }
      res.note = 'provisional: builder-run receipt; a fresh verifier receipt is required before merge';
    }
    res.ok = true;
    return res;
  });
}
function renderTable(results) {
  const l = ['| feature | profile | status | verifier | receipt | verdict |', '|---|---|---|---|---|---|'];
  for (const r of results) { const rc = r.receipt; l.push(`| ${r.id} | ${r.profile} | ${rc ? rc.status : '—'} | ${rc ? rc.verifier : '—'} | ${rc ? rc.file : '—'} | ${r.ok ? '✅' + (r.note ? ' ' + r.note : '') : `❌ ${r.why}`} |`); }
  return l;
}

// ---------------------------------------------------------------- commands
function cmdPolicyInit(f) {
  if (fs.existsSync(POLICY_PATH)) { out(`exists: ${path.relative(ROOT, POLICY_PATH)}`); return; }
  writeJson(POLICY_PATH, { ...DEFAULT_POLICY, app: f.app || path.basename(ROOT), skill: f.app ? `.agents/skills/verify-${f.app}` : null });
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RECEIPTS_DIR, '.gitkeep'), '');
  out(`wrote ${path.relative(ROOT, POLICY_PATH)}`);
}
function cmdFeatures(f) {
  const policy = loadPolicy();
  const feats = loadFeatures(policy);
  if (f.json) { out(JSON.stringify({ features: feats, quick_paths: policy.quick_paths, digest_ignore: policy.digest_ignore, scope: policy.scope, features_dir: featuresDir(policy) ? path.relative(ROOT, featuresDir(policy)) : null })); return; }
  if (!feats.length) { out('no features mapped (run /create-verification-skill)'); return; }
  for (const f of feats) out(`${f.id.padEnd(32)} ${f.profile.padEnd(9)} ${f.surface.padEnd(8)} ${f.file}  [${f.paths.join(', ')}]`);
}
function resolveBase(b) {
  if (b && refExists(b)) return b;
  for (const c of [b, 'main', 'master', 'origin/main', 'origin/master'].filter(Boolean)) if (refExists(c)) { if (b && b !== c) warn(`base "${b}" not found; using "${c}"`); return c; }
  return die(`no usable base ref (tried ${b || 'main'}, master, origin/main)`);
}
function cmdStart(f) {
  const policy = loadPolicy();
  const feats = loadFeatures(policy);
  let chosen = [];
  let base = null;
  if (f.auto) {
    base = resolveBase(f.base);
    const files = new Set([...(git(['diff', '--name-only', base], { allowFail: true }) || '').split('\n'), ...(git(['ls-files', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n')].map((s) => s.trim()).filter(Boolean));
    chosen = affectedFeatures([...files], feats);
    if (!chosen.length) { out(`no mapped feature affected by changes vs ${base}; nothing pending`); return; }
  } else {
    const ids = need(f, 'features').split(',').map((s) => s.trim()).filter(Boolean);
    chosen = ids.map((id) => feats.find((x) => x.id === id) || { id, profile: f.profile || 'changed', unmapped: true });
    for (const c of chosen) if (c.unmapped) warn(`feature "${c.id}" is not in the map; add a feature file before relying on it`);
  }
  const requested = f.profile || null;
  const features = chosen.map((c) => ({ id: c.id, profile: maxProfile([c.profile || 'changed', requested].filter(Boolean)) }));
  const profile = maxProfile(features.map((c) => c.profile));
  writeJson(PENDING_PATH, { task: f.task || '', profile, features, created_at: nowIso(), base, paused: null });
  try { fs.unlinkSync(COUNTER_PATH); } catch {}
  out(`pending: ${chosen.map((c) => `${c.id}(${c.profile || profile})`).join(', ')} — task profile: ${profile}`);
  for (const c of chosen) if (c.file) out(`  read first: ${c.file}  (its Proof section is the acceptance criteria)`);
  out('the Stop hook refuses to end the task until each has a receipt for the exact code tree (passed, or blocked/unreachable/not_applicable with a reason).');
  out('need user input before you can verify? `verify.mjs pause --reason "..."`, then ask.');
}
/** Add features to the pending task without resetting it (auto-arm from the harness, or a task that grew). */
function cmdArm(f) {
  const policy = loadPolicy();
  const feats = loadFeatures(policy);
  const ids = need(f, 'features').split(',').map((x) => x.trim()).filter(Boolean);
  const p = readJson(PENDING_PATH, null) || { task: f.task || '', profile: 'quick', features: [], created_at: nowIso(), base: null, paused: null };
  const added = [];
  for (const id of ids) {
    if (p.features.some((x) => x.id === id)) continue;
    const fe = feats.find((x) => x.id === id);
    if (!fe) { warn(`feature "${id}" is not in the map; ignored`); continue; }
    p.features.push({ id, profile: maxProfile([fe.profile, p.profile]) }); added.push(fe);
  }
  p.profile = maxProfile(p.features.map((x) => x.profile));
  if (f.task && !p.task) p.task = f.task;
  writeJson(PENDING_PATH, p);
  out(`armed: ${added.map((x) => `${x.id}(${x.profile})`).join(', ') || 'nothing new'} — pending now: ${p.features.map((x) => x.id).join(', ')} · profile ${p.profile}`);
  for (const fe of added) out(`  read first: ${fe.file}  (its Proof section is the acceptance criteria)`);
}
function cmdPause(f) {
  const p = readJson(PENDING_PATH, null); if (!p) die('nothing pending');
  p.paused = need(f, 'reason'); writeJson(PENDING_PATH, p); out(`paused: ${p.paused} (re-armed by resume, run-new or receipt)`);
}
function cmdResume() { const p = readJson(PENDING_PATH, null); if (!p) die('nothing pending'); p.paused = null; writeJson(PENDING_PATH, p); try { fs.unlinkSync(COUNTER_PATH); } catch {} out('resumed (block counter reset)'); }
function cmdCancel() {
  const p = readJson(PENDING_PATH, null); if (!p) { out('nothing pending'); return; }
  try { fs.unlinkSync(PENDING_PATH); } catch {} try { fs.unlinkSync(COUNTER_PATH); } catch {}
  out(`cancelled pending: ${p.features.map((x) => x.id).join(', ')} (CI still requires receipts for affected features)`);
}
function unpause() { const p = readJson(PENDING_PATH, null); if (p && p.paused) { p.paused = null; writeJson(PENDING_PATH, p); } }
function cmdRunNew(f) {
  const sha = headSha();
  const stamp = nowIso().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  const id = `${stamp}-${sha.slice(0, 7)}${f.label ? '-' + String(f.label).replace(/[^a-z0-9.-]/gi, '_') : ''}`;
  const dir = path.join(RUNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const ver = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : 'n/a'; };
  fs.writeFileSync(path.join(dir, 'env.txt'), [`run_id: ${id}`, `sha: ${sha}`, `dirty: ${isDirty()}`, `created_at: ${nowIso()}`, `node: ${process.version}`, `pnpm: ${ver('pnpm', ['--version'])}`, `bun: ${ver('bun', ['--version'])}`, `os: ${process.platform} ${ver('uname', ['-r'])}`].join('\n') + '\n');
  unpause();
  out(id);
  out(`export VERIFY_RUN_DIR=${dir}`);
}
// ---------------------------------------------------------------- artifact plausibility (evidence that could not have been faked by `echo`)
const SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/-]{20,}/, 'bearer token'], [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key (sk-…)'], [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'], [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/"(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)"\s*:\s*"(?!\[REDACTED\])[^"]{4,}"/i, 'secret-looking JSON field'],
  [/set-cookie:\s*[^\n]{10,}/i, 'set-cookie header'],
];
const STRONG = new Set(['png', 'jpg', 'trace', 'video', 'http', 'readback', 'transcript', 'zip', 'pdf', 'file']);
/** Returns { kind, ok, strong, note }. ok=false means the artifact cannot be evidence (fake, truncated, or leaks a secret). */
function checkArtifact(abs, rel) {
  const size = fs.statSync(abs).size;
  const name = path.basename(rel).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const head = size ? Buffer.alloc(Math.min(size, 4096)) : Buffer.alloc(0);
  if (size) { const fd = fs.openSync(abs, 'r'); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd); }
  const isText = ['txt', 'log', 'md', 'json', 'csv', 'html', 'xml', 'yaml', 'yml'].includes(ext);
  if (isText && size < 5_000_000) {
    const text = fs.readFileSync(abs, 'utf8');
    for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return { kind: ext, ok: false, strong: false, note: `contains what looks like a ${what} — evidence must be redacted` };
  }
  if (ext === 'png') {
    const sig = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const w = head.length >= 24 ? head.readUInt32BE(16) : 0, h = head.length >= 24 ? head.readUInt32BE(20) : 0;
    if (!sig || w < 64 || h < 64) return { kind: 'png', ok: false, strong: true, note: sig ? `implausible screenshot ${w}x${h}` : 'not a PNG' };
    return { kind: 'png', ok: true, strong: true, note: `${w}x${h}` };
  }
  if (ext === 'jpg' || ext === 'jpeg') return head[0] === 0xff && head[1] === 0xd8 && size > 1024 ? { kind: 'jpg', ok: true, strong: true, note: '' } : { kind: 'jpg', ok: false, strong: true, note: 'not a JPEG' };
  if (ext === 'zip') {
    if (!(head[0] === 0x50 && head[1] === 0x4b) || size < 512) return { kind: 'zip', ok: false, strong: true, note: 'not a zip' };
    if (name.includes('trace')) { const buf = fs.readFileSync(abs); const hasTrace = buf.includes('.trace') || buf.includes('trace.network'); return hasTrace ? { kind: 'trace', ok: true, strong: true, note: 'playwright trace' } : { kind: 'trace', ok: false, strong: true, note: 'zip without trace entries' }; }
    return { kind: 'zip', ok: true, strong: false, note: 'zip is not a trace' };
  }
  if (ext === 'webm' || ext === 'mp4') {
    const ok = ext === 'webm' ? head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) : head.subarray(4, 8).toString() === 'ftyp';
    return { kind: 'video', ok: ok && size > 10_240, strong: true, note: ok ? '' : `not a ${ext}` };
  }
  if (ext === 'pdf') return head.subarray(0, 4).toString() === '%PDF' && size > 1024 ? { kind: 'pdf', ok: true, strong: true, note: '' } : { kind: 'pdf', ok: false, strong: true, note: 'not a PDF' };
  if (ext === 'json' && (rel.includes('/http/') || rel.includes('/readback/'))) {
    try { const j = JSON.parse(fs.readFileSync(abs, 'utf8')); if (rel.includes('/http/') && !(j && j.request && j.response && typeof j.response.status === 'number')) return { kind: 'http', ok: false, strong: true, note: 'http dump without request/response.status' }; return { kind: rel.includes('/http/') ? 'http' : 'readback', ok: true, strong: true, note: '' }; }
    catch { return { kind: 'http', ok: false, strong: true, note: 'invalid JSON' }; }
  }
  if (/^cli-.*\.txt$/.test(name)) { const t = fs.readFileSync(abs, 'utf8'); return /exit_code:\s*\d+/.test(t) ? { kind: 'transcript', ok: true, strong: true, note: '' } : { kind: 'transcript', ok: false, strong: true, note: 'transcript without exit_code (use harness/cli.sh)' }; }
  if (name === 'env.txt') return { kind: 'env', ok: true, strong: false, note: '' };
  if (size === 0) return { kind: ext || 'file', ok: false, strong: false, note: 'empty file' };
  return { kind: ext || 'file', ok: true, strong: false, note: ext ? `unrecognized .${ext}` : 'unrecognized file' };
}
function scanSecrets(text) {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what;
  return null;
}
function cmdReceipt(f) {
  const runId = need(f, 'run'); const featureId = need(f, 'feature'); const status = need(f, 'status');
  if (!STATUSES.includes(status)) die(`status must be one of: ${STATUSES.join(', ')}`);
  const reason = typeof f.reason === 'string' ? f.reason : '';
  if (status !== 'passed' && !reason.trim()) die('--reason is required when status is not "passed" (no silent skips)');
  const verifier = f.verifier || 'builder';
  if (!['builder', 'fresh'].includes(verifier)) die('--verifier must be builder or fresh');
  if (verifier === 'fresh' && process.env.VERIFY_FRESH !== '1' && !fs.existsSync(path.join(ROOT, '.verify-fresh-worktree'))) {
    die('--verifier fresh requires VERIFY_FRESH=1 or a .verify-fresh-worktree marker (builder cannot self-attest)');
  }
  const runDir = path.join(RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) die(`run dir not found: ${path.relative(ROOT, runDir)} (create it with run-new)`);
  const policy = loadPolicy();
  const feat = loadFeatures(policy).find((x) => x.id === featureId);
  if (!feat) warn(`feature "${featureId}" is not in the map; the receipt will not be matched by check-ci until a feature file exists`);
  const profile = f.profile || feat?.profile || 'changed';
  const surface = f.surface || feat?.surface || 'unknown';
  const artifacts = walk(runDir).map((p) => { const rel = path.relative(ROOT, p); return { path: rel, sha256: sha256File(p), ...checkArtifact(p, rel) }; });
  const bad = artifacts.filter((a) => !a.ok);
  if (bad.length) die(`evidence rejected:\n${bad.map((a) => `  - ${a.path}: ${a.note}`).join('\n')}\nRe-capture real evidence (screenshots ≥64px, Playwright trace.zip, harness/cli.sh transcripts, http/readback JSON) and redact secrets.`);
  const strong = artifacts.filter((a) => a.strong);
  if (status === 'passed' && !strong.length) die(`"passed" needs evidence from the surface: ${path.relative(ROOT, runDir)} has no screenshot, trace, video, http/readback dump or CLI transcript — only ${artifacts.map((a) => path.basename(a.path)).join(', ') || 'env.txt'}.`);
  const notes = f['notes-file'] ? fs.readFileSync(String(f['notes-file']), 'utf8').trim() : '';
  if (notes) { const leak = scanSecrets(notes); if (leak) die(`--notes-file contains what looks like a ${leak} — redact before embedding in a receipt`); }
  if (status === 'passed' && !notes) die('passed receipts require --notes-file with Observations / Forbidden / Read-back');
  const tree = workingTree();
  const sha = headSha(); const dirty = isDirty();
  const fm = ['---', 'receipt: verification-receipt/v0', `run_id: ${runId}`, `feature_id: ${featureId}`, `profile: ${profile}`, `surface: ${surface}`,
    `sha: ${sha}`, `code_digest: ${codeDigest(tree, policy)}`, `dirty: ${dirty}`, `untracked: ${untrackedCount()}`,
    `status: ${status}`, `reason: ${JSON.stringify(reason)}`, `verifier: ${verifier}`, `verifier_session: ${JSON.stringify(f.session ? String(f.session) : '')}`,
    `evidence_dir: ${path.relative(ROOT, runDir)}`, `created_at: ${nowIso()}`, '---'].join('\n');
  const body = notes || ['## Observations (expected → seen)', '', '- ', '', '## Forbidden (must not happen → confirmed absent)', '', '- ', '', '## Read-back (side effects checked through an independent path)', '', '- '].join('\n');
  const table = ['## Artifacts', '', '| path | kind | check | sha256 |', '|---|---|---|---|', ...artifacts.map((a) => `| ${a.path} | ${a.kind} | ${a.strong ? 'evidence' : 'aux'}${a.note ? ' · ' + a.note : ''} | ${a.sha256} |`)].join('\n');
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const outPath = path.join(RECEIPTS_DIR, `${runId}--${featureId}.md`);
  fs.writeFileSync(outPath, `${fm}\n\n# Receipt: ${featureId} — ${status}\n\n${body}\n\n${table}\n`);
  unpause();
  if (dirty) warn('uncommitted changes: the receipt is bound to the exact content verified (code_digest). Commit exactly this content — any later edit needs a new receipt.');
  out(path.relative(ROOT, outPath));
}
function pendingStatus(policy) {
  const pending = readJson(PENDING_PATH, null);
  if (!pending) return { pending: null, ok: true, paused: null, results: [], blocks: 0 };
  const digest = codeDigest(workingTree(), policy);
  const results = evaluate({ feats: pending.features, receipts: loadReceipts(), policy, digest, strict: false });
  const blocks = parseInt(fs.existsSync(COUNTER_PATH) ? fs.readFileSync(COUNTER_PATH, 'utf8') : '0', 10) || 0;
  return { pending, digest, results, ok: results.every((r) => r.ok), paused: pending.paused || null, blocks };
}
const HOW_TO_FINISH = [
  'To finish, prove each feature through the real surface, or record explicitly why you could not:',
  '  1. node .agents/verify-kit/verify.mjs run-new                 → run dir; export VERIFY_RUN_DIR',
  '  2. follow .agents/skills/verify-*/SKILL.md  (launch → doctor → drive → evidence → cleanup)',
  '  3. node .agents/verify-kit/verify.mjs receipt --run <id> --feature <id> --status passed --notes-file <obs.md>',
  '     or --status blocked|unreachable|not_applicable --reason "<why, precisely>"',
  'Need the user before you can verify? node .agents/verify-kit/verify.mjs pause --reason "..." then ask.',
  'A green test suite is not a receipt. "failed" does not release the task: fix, then re-verify.',
];
function cmdStatus(f) {
  const policy = loadPolicy();
  const st = pendingStatus(policy);
  if (f.json) { out(JSON.stringify({ ...st, results: st.results.map((r) => ({ id: r.id, profile: r.profile, ok: r.ok, why: r.why, note: r.note, status: r.receipt?.status, receipt: r.receipt?.file })) })); return; }
  if (!st.pending) { out('no pending task'); return; }
  out(`pending${st.paused ? ` (paused: ${st.paused})` : ''}: task="${st.pending.task}" profile=${st.pending.profile} blocks=${st.blocks} tree=${st.digest.slice(0, 12)}`);
  for (const r of st.results) out(`  ${r.ok ? '✅' : '❌'} ${r.id} (${r.profile}) ${r.ok ? r.receipt.status + (r.note ? ' — ' + r.note : '') : r.why}`);
}
/** Shared decision for harness hooks. Side effects: clears pending on success, increments the block counter otherwise. */
function settle(policy) {
  const st = pendingStatus(policy);
  if (!st.pending) return { code: 0, kind: 'none', message: '' };
  if (st.paused) return { code: 0, kind: 'paused', message: `verify-kit: verification paused (${st.paused}); pending: ${st.pending.features.map((x) => x.id).join(', ')}. run-new / receipt / resume re-arm.` };
  if (st.ok) {
    try { fs.unlinkSync(PENDING_PATH); } catch {} try { fs.unlinkSync(COUNTER_PATH); } catch {}
    const notes = st.results.filter((r) => r.note).map((r) => `- ${r.id}: ${r.note}`);
    return { code: 0, kind: 'ok', message: `verify-kit: all pending features have receipts for this code tree (${st.results.map((r) => `${r.id}=${r.receipt.status}`).join(', ')}). Commit exactly this content.` + (notes.length ? `\n${notes.join('\n')}` : '') };
  }
  const n = st.blocks + 1;
  fs.writeFileSync(COUNTER_PATH, String(n));
  const lines = st.results.filter((r) => !r.ok).map((r) => `- ${r.id} (${r.profile}): ${r.why}`);
  const max = policy.hook.max_blocks || 5;
  if (n > max) return { code: 4, kind: 'capped', message: `verify-kit: stop allowed after ${n - 1} blocks, but verification is STILL PENDING:\n${lines.join('\n')}\npending.json stays; check-commit / CI will refuse.` };
  return { code: 3, kind: 'pending', message: [`verify-kit: verification pending (block ${n}/${max})`, ...lines, ...HOW_TO_FINISH].join('\n') };
}
function cmdSettle(f) {
  const r = settle(loadPolicy());
  if (f.json) out(JSON.stringify(r)); else if (r.message) out(r.message);
  process.exit(r.code);
}
function cmdCheckHook() {
  const input = readStdinJson();
  const r = settle(loadPolicy());
  if (r.kind === 'none') process.exit(0);
  if (r.kind === 'pending') { err(r.message + (input.stop_hook_active ? '\n[continuation]' : '')); process.exit(2); }
  out(JSON.stringify({ systemMessage: r.message }));
  process.exit(0);
}
function gate({ title, files, digest, policy, strict, extra = [], receipts = loadReceipts() }) {
  const feats = loadFeatures(policy);
  const l = [`## ${title}`, '', ...extra];
  files = files.filter((x) => !matchAny(x, policy.digest_ignore));
  const quick = files.filter((x) => matchAny(x, policy.quick_paths));
  const nonQuick = files.filter((x) => !matchAny(x, policy.quick_paths));
  const affected = affectedFeatures(nonQuick, feats);
  const covered = new Set(); for (const fe of affected) for (const x of nonQuick) if (matchAny(x, fe.paths)) covered.add(x);
  const unmapped = nonQuick.filter((x) => !covered.has(x));
  const profile = affected.length ? maxProfile(affected.map((a) => a.profile)) : 'quick';
  l.push(`Profile: **${profile}** · affected features: ${affected.length} · quick-path files: ${quick.length} · unmapped files: ${unmapped.length} · code_digest \`${digest.slice(0, 12)}\``, '');
  let fail = false;
  if (affected.length) { const results = evaluate({ feats: affected, receipts, policy, digest, strict }); l.push(...renderTable(results), ''); if (results.some((r) => !r.ok)) fail = true; }
  const isProof = (x) => /\.agents\/skills\/verify-[^/]+\/(features\/[^/]+\.md|harness\/.+)$/.test(x);
  const proofEdits = files.filter(isProof);
  const unmappedProduct = unmapped.filter((x) => !isProof(x));
  if (proofEdits.length) { l.push('⚠️ Proof definitions or harness changed — review that diff before trusting the receipts (harness edits invalidate receipts; feature-map edits do not, by design):', ...proofEdits.map((x) => `- \`${x}\``), ''); }
  if (unmappedProduct.length) { l.push(`${policy.unmapped === 'block' ? '❌' : '⚠️'} Changed files not covered by any mapped feature (policy.unmapped = ${policy.unmapped}):`, ...unmappedProduct.map((x) => `- \`${x}\``), ''); if (policy.unmapped === 'block') fail = true; }
  return { lines: l, fail };
}
function finish(lines, code) {
  const text = lines.join('\n') + '\n';
  out(text);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text); } catch {} }
  process.exit(code);
}
function cmdCheckCi(f) {
  const base = need(f, 'base'); const head = need(f, 'head');
  for (const s of [base, head]) if (!refExists(s)) die(`commit ${s} is not present locally (use fetch-depth: 0 / fetch the PR head)`);
  const policy = loadPolicy();
  const files = changedFiles(base, head);
  if (!files.length) return finish(['## Behavioral verification (verify-kit)', '', 'No changes. **PASS**'], 0);
  const { lines, fail } = gate({ title: 'Behavioral verification (verify-kit)', files, digest: codeDigest(head, policy), policy, strict: true, extra: [`Base \`${base.slice(0, 12)}\` → Head \`${head.slice(0, 12)}\` · ${files.length} changed file(s)`, ''] });
  lines.push(fail ? '**Result: FAIL** — not eligible for a merge decision.' : '**Result: PASS** — eligible for a merge decision (a green check is not permission to merge).');
  return finish(lines, fail ? 1 : 0);
}
/** --staged (default, git pre-commit): index vs receipts. --working-tree: everything vs HEAD incl. untracked (what `git add -A && git commit`
 *  would commit). --auto (tool_call gates, run BEFORE the command executes): working-tree mode whenever the working tree differs from the index. */
function cmdCheckCommit(f) {
  const policy = loadPolicy();
  const split = (o) => (o || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const staged = split(git(['diff', '--cached', '--name-only'], { allowFail: true }));
  const unstaged = split(git(['diff', '--name-only'], { allowFail: true }));
  const untracked = split(git(['ls-files', '--others', '--exclude-standard'], { allowFail: true }));
  let mode = f['working-tree'] ? 'working-tree' : f.auto ? (unstaged.length || untracked.length ? 'working-tree' : 'staged') : 'staged';
  let files, tree, note;
  if (mode === 'working-tree') {
    files = [...new Set([...split(git(['diff', '--name-only', 'HEAD'], { allowFail: true })), ...untracked])];
    tree = workingTree();
    note = `Mode: working tree (${staged.length} staged, ${unstaged.length} unstaged, ${untracked.length} untracked) — evaluated as if everything were committed`;
  } else { files = staged; tree = indexTree(); note = `Mode: staged (${files.length} file(s))`; }
  if (!files.length) process.exit(0);
  if (!tree) die('could not construct exact working-tree digest');
  const receipts = mode === 'staged' ? loadReceipts().filter((r) => staged.includes(r.file)) : loadReceipts();
  const { lines, fail } = gate({ title: 'verify-kit commit gate', files, digest: codeDigest(tree, policy), policy, strict: false, extra: [note, ''], receipts });
  if (fail) lines.push('**Commit refused.** Verify exactly this content (receipt code_digest must equal the tree being committed), commit exactly what you verified (no stray edits or untracked scratch files), or `git commit --no-verify` and let CI say no.');
  else lines.push('**OK** — staged tree matches its receipts.');
  return finish(lines, fail ? 1 : 0);
}
function cmdReport(f) {
  const policy = loadPolicy();
  const sha = f.sha ? String(f.sha) : headSha();
  const digest = codeDigest(sha, policy);
  const receipts = loadReceipts().filter((r) => r.code_digest === digest);
  out(`receipts for code tree at ${sha.slice(0, 12)} (code_digest ${digest.slice(0, 12)}): ${receipts.length}`);
  for (const fe of loadFeatures(policy)) { const r = latest(receipts.filter((x) => x.feature_id === fe.id)); out(`${fe.id.padEnd(32)} ${fe.profile.padEnd(9)} ${r ? `${r.status} (${r.verifier}) ${r.file}` : '— no receipt'}`); }
}
// ---------------------------------------------------------------- registry of drivable surface (product source → ids the map may reference)
const SRC_EXT = /\.(tsx?|jsx?|mts|mjs|vue|svelte|astro|html)$/;
const normRoute = (r) => '/' + r.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map((seg) => (/^(\$|:|\[|\$\{)/.test(seg) || /^\{/.test(seg) ? ':param' : seg.replace(/\.(tsx?|jsx?)$/, ''))).join('/');
function productFiles(policy) {
  const tracked = (git(['ls-files', '--cached', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n').filter(Boolean);
  return tracked.filter((p) => SRC_EXT.test(p) && !p.startsWith('.agents/') && !p.startsWith('verification/') && !p.startsWith('.pi/') && !matchAny(p, policy.digest_ignore) && !/\.(test|spec|stories)\./.test(p) && !/(^|\/)(e2e|harness|__tests__)\//.test(p));
}
function buildRegistry(policy) {
  const reg = { generated_at: nowIso(), sha: headSha(), actions: [], states: [], routes: [], commands: [] };
  const seen = { actions: new Set(), states: new Set(), routes: new Set(), commands: new Set() };
  const add = (k, id, file, line) => { if (!seen[k].has(id)) { seen[k].add(id); reg[k].push({ id, file, line }); } };
  const PAT = [
    ['actions', /data-action-id\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*['"`]([^'"`]+)['"`]\s*\})/g],
    ['states', /data-state\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*['"`]([^'"`]+)['"`]\s*\})/g],
    ['routes', /createFileRoute\(\s*['"`]([^'"`]+)['"`]/g], ['routes', /\b(?:app|router|api|hono|r)\.(?:get|post|put|patch|delete|on|route|all)\(\s*['"`](\/[^'"`]*)['"`]/g],
    ['commands', /\.command\(\s*['"`]([a-z][a-z0-9:_-]*)/g],
  ];
  for (const file of productFiles(policy)) {
    let text; try { text = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
    if (text.length > 2_000_000) continue;
    for (const [k, re] of PAT) for (const m of text.matchAll(re)) { const id = m[1] ?? m[2] ?? m[3]; if (id) add(k, k === 'routes' ? normRoute(id) : id, file, text.slice(0, m.index).split('\n').length); }
    const rm = file.match(/(?:^|\/)routes\/(.+?)(?:\/(?:index|route|page))?\.(?:tsx?|jsx?)$/);
    if (rm && !/^__|\/__|^_/.test(rm[1])) add('routes', normRoute(rm[1].replace(/\.(?:index|route|lazy)$/, '').replace(/\./g, '/')), file, 1);
  }
  return reg;
}
function cmdRegistry(f) {
  const reg = buildRegistry(loadPolicy());
  const outPath = V('registry.json');
  if (f.write) { writeJson(outPath, reg); out(`wrote ${path.relative(ROOT, outPath)}: ${reg.actions.length} actions, ${reg.states.length} states, ${reg.routes.length} routes, ${reg.commands.length} commands`); return; }
  out(JSON.stringify(reg, null, 2));
}
/** References the map/harness make: selectors, states, routes, commands — checked against the registry. */
function mapReferences(policy) {
  const fd = featuresDir(policy);
  const files = [];
  if (fd && fs.existsSync(fd)) files.push(...walk(fd).filter((p) => p.endsWith('.md')));
  const hd = fd ? path.join(path.dirname(fd), 'harness') : null;
  if (hd && fs.existsSync(hd)) files.push(...walk(hd).filter((p) => /\.(m?[jt]s|sh)$/.test(p)));
  const refs = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/data-action-id\s*=\s*['"]([^'"]+)['"]/g)) refs.push({ k: 'actions', id: m[1], file: rel, line: i + 1 });
      for (const m of line.matchAll(/data-state\s*=\s*['"]([^'"]+)['"]/g)) refs.push({ k: 'states', id: m[1], file: rel, line: i + 1 });
      for (const m of line.matchAll(/(?:\$\{BASE_URL\}|\$\{API_URL\}|https?:\/\/[^/'"`\s]+)(\/[A-Za-z0-9_\-./:$\{\}]*)/g)) { const r = m[1].replace(/\?.*$/, ''); if (r.length > 1) refs.push({ k: 'routes', id: normRoute(r), file: rel, line: i + 1 }); }
      for (const m of line.matchAll(/(?:^|\s)(\/[a-z][A-Za-z0-9_\-./:$]*)(?=\s|$|[`)\]])/g)) if (/^\/(?!api\/(test|debug))/.test(m[1]) && !m[1].includes('/verify-kit') && !m[1].includes('/skills/') && !/\.(md|ts|mts|sh|json)$/.test(m[1])) refs.push({ k: 'routes', id: normRoute(m[1]), file: rel, line: i + 1, soft: true });
    });
  }
  return refs;
}
function cmdLintMap(f) {
  const policy = loadPolicy();
  const regPath = V('registry.json');
  const reg = !f.fresh && fs.existsSync(regPath) ? readJson(regPath, null) : buildRegistry(policy);
  const sets = Object.fromEntries(['actions', 'states', 'routes', 'commands'].map((k) => [k, new Set((reg[k] || []).map((x) => x.id))]));
  const routeMatch = (r) => { if (sets.routes.has(r)) return true; const a = r.split('/'); return [...sets.routes].some((x) => { const b = x.split('/'); return a.length === b.length && b.every((seg, i) => seg === ':param' || seg === a[i]); }); };
  const l = []; let errors = 0, warns = 0;
  const feats = loadFeatures(policy);
  const tracked = new Set((git(['ls-files', '--cached', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n').filter(Boolean));
  for (const fe of feats) for (const g of fe.paths) if (![...tracked].some((p) => globToRegex(g).test(p))) { errors++; l.push(`error ${fe.file}: paths glob "${g}" matches no file (moved module? dead glob)`); }
  const refs = mapReferences(policy);
  const used = { actions: new Set(), states: new Set() };
  for (const r of refs) {
    if (r.k === 'actions' || r.k === 'states') { used[r.k].add(r.id); if (sets[r.k].size && !sets[r.k].has(r.id)) { errors++; l.push(`error ${r.file}:${r.line}: ${r.k === 'actions' ? 'data-action-id' : 'data-state'} "${r.id}" does not exist in product source`); } }
    else if (r.k === 'routes' && sets.routes.size && !routeMatch(r.id)) { if (r.soft) { warns++; l.push(`warn  ${r.file}:${r.line}: route-looking "${r.id}" not in registry`); } else { errors++; l.push(`error ${r.file}:${r.line}: route "${r.id}" does not exist in product source`); } }
  }
  const uncoveredActions = (reg.actions || []).filter((a) => !used.actions.has(a.id));
  if (uncoveredActions.length) l.push(`info  ${uncoveredActions.length} product action(s) referenced by no feature file: ${uncoveredActions.slice(0, 12).map((a) => a.id).join(', ')}${uncoveredActions.length > 12 ? ', …' : ''}`);
  l.push(`lint-map: registry ${reg.actions?.length || 0} actions / ${reg.states?.length || 0} states / ${reg.routes?.length || 0} routes / ${reg.commands?.length || 0} commands · ${refs.length} reference(s) · ${errors} error(s), ${warns} warning(s)`);
  out(l.join('\n'));
  process.exit(errors ? 1 : 0);
}
function cmdLint(f) {
  const policy = loadPolicy();
  const fd = featuresDir(policy);
  const dirs = f._.length ? f._ : [fd ? path.join(path.dirname(fd), 'harness') : null, 'harness', 'e2e', 'tests/e2e', 'playwright'].filter(Boolean);
  const rules = [
    { re: /(locator|\$\$?|querySelector(All)?)\(\s*['"`]\./, level: 'error', msg: 'class-based selector (use ARIA role/label, data-action-id, data-state)' },
    { re: /\.click\(\s*['"`]\./, level: 'error', msg: 'class-based click target' },
    { re: /mouse\.click\(\s*\d/, level: 'error', msg: 'coordinate click' },
    { re: /waitForTimeout\(|setTimeout\(\s*(resolve|r)\s*,|(^\s*|[;&|]\s*)sleep\s+\d/, level: 'error', msg: 'fixed sleep — poll a semantic end state instead (or mark a polling loop with lint-allow)' },
    { re: /\.nth\(\d+\)/, level: 'warn', msg: 'positional selector (.nth) is order-dependent' },
    { re: /getByText\(/, level: 'warn', msg: 'text selector — fine for copy you own, fragile otherwise' },
    { re: /\/api\/(test|debug|__)/, level: 'warn', msg: 'test/debug endpoint — proof must use the real user path' },
  ];
  const l = []; let errors = 0, warns = 0, scanned = 0;
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(ROOT, d);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    for (const p of walk(abs).filter((x) => /\.(m?[jt]s|sh)$/.test(x))) {
      scanned++;
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('lint-allow')) return;
        for (const r of rules) if (r.re.test(line)) { r.level === 'error' ? errors++ : warns++; l.push(`${r.level.padEnd(5)} ${path.relative(ROOT, p)}:${i + 1}: ${r.msg}\n      ${line.trim()}`); }
      });
    }
  }
  l.push(`lint-selectors: ${scanned} file(s), ${errors} error(s), ${warns} warning(s)`);
  out(l.join('\n'));
  process.exit(errors ? 1 : 0);
}

// ---------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
const flags = parseArgs(rest);
const commands = { 'policy-init': cmdPolicyInit, features: cmdFeatures, arm: cmdArm, registry: cmdRegistry, 'lint-map': cmdLintMap, start: cmdStart, pause: cmdPause, resume: cmdResume, cancel: cmdCancel, 'run-new': cmdRunNew, receipt: cmdReceipt, status: cmdStatus, settle: cmdSettle, 'check-hook': cmdCheckHook, 'check-commit': cmdCheckCommit, 'check-ci': cmdCheckCi, report: cmdReport, 'lint-selectors': cmdLint };
if (commands[cmd]) commands[cmd](flags);
else { out((fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//) || ['', ''])[1].replace(/^ \* ?/gm, '').trim()); process.exit(cmd ? 1 : 0); }
