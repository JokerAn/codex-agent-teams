import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

export const prepareWorkspaceSchema = z.strictObject({ dirtyPolicy: z.enum(['reject', 'snapshot']).default('reject') });
export const scopedPath = z.string().min(1).refine(path => !path.includes('\0') && !path.split('/').some(part => ['.git', '.codex-teams'].includes(part)) && !isAbsolute(path) && !path.includes('\\') && !path.split('/').some(part => ['..', '.', ''].includes(part)), 'Use a repository-relative file or directory without dot segments');
export const inspectWorkspaceSchema = z.strictObject({ allowedPaths: z.array(scopedPath).min(1).max(100).optional() });
export const removeWorkspaceSchema = z.strictObject({ discard: z.boolean().default(false) });
const idSchema = z.uuid();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const fields = bytes => decode(bytes).split('\0').filter(Boolean);
const line = bytes => decode(bytes).replace(/\n$/, '');
const excluded = ['--', '.', ':(top,exclude).codex-teams'];
const inside = (root, path) => { const suffix = relative(root, path); return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`)); };

// Git is invoked directly; inherited repository/index overrides cannot redirect it.
function git(root, args, { env = {}, input, optional = false } = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  try {
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
      env: { ...inherited, ...env, LC_ALL: 'C', LANG: 'C' }, input, timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (optional && error.status === 1) return null;
    throw new Error(`Git ${args[0]} failed: ${String(error.stderr ?? error.message).slice(-1600)}`);
  }
}
/** Stable checkout identity; HEAD changes do not change the authorized target. */
export function workspaceIdentity(workspace) {
  const root = realpathSync(workspace), stat = lstatSync(root);
  if (!stat.isDirectory()) throw new Error('Workspace must be a directory');
  let gitDir = null, commonDir = null;
  try {
    gitDir = realpathSync(line(git(root, ['rev-parse', '--absolute-git-dir'])));
    commonDir = realpathSync(line(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
  } catch (error) {
    if (!error.message.includes('not a git repository')) throw error;
  }
  return { root, device: stat.dev, inode: stat.ino, gitDir, commonDir,
    gitDevice: gitDir ? lstatSync(gitDir).dev : null, gitInode: gitDir ? lstatSync(gitDir).ino : null };
}
export function assertWorkspace(expected, actual) {
  if (typeof expected === 'string') {
    if (!isAbsolute(expected) || realpathSync(expected) !== actual.root) throw new Error(`Target workspace mismatch: expected ${expected}; configured ${actual.root}`);
  } else if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Target workspace identity changed; create a new task and confirm the target');
}
function safeDirectory(path) {
  if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) throw new Error(`Managed directory must not be a symlink: ${path}`);
  mkdirSync(path, { recursive: true });
}
function statuses(bytes) {
  const tokens = fields(bytes), result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== ' ') throw new Error('Invalid Git status record');
    const status = token.slice(0, 2), path = token.slice(3);
    const originalPath = /[RC]/.test(status) ? tokens[++i] : undefined;
    if (/[RC]/.test(status) && !originalPath) throw new Error('Incomplete Git rename record');
    result.push({ status, path, ...(originalPath ? { originalPath } : {}) });
  }
  if (result.length > 10000) throw new Error('More than 10000 changed paths; split the workspace first');
  return result;
}
function rejectFilters(root, paths) {
  const attributes = fields(git(root, ['check-attr', '-z', '--stdin', 'filter'], { input: Buffer.from(paths.join('\0') + (paths.length ? '\0' : '')) }));
  for (let i = 2; i < attributes.length; i += 3) if (!['unspecified', 'unset'].includes(attributes[i])) throw new Error('External Git clean/smudge filters are unsupported');
}
function fileManifest(root, paths) {
  const result = new Map();
  let total = 0;
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (absolute === root || !inside(root, absolute)) throw new Error(`File escapes repository: ${path}`);
    // No traversal through parent symlinks, even for a path supplied by the index.
    let parent = dirname(absolute);
    while (parent !== root) {
      if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error(`Symlinked file parent: ${path}`);
      parent = dirname(parent);
    }
    let stat;
    try { stat = lstatSync(absolute); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stat) { result.set(path, { type: 'missing' }); continue; }
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      if (isAbsolute(target) || !inside(root, resolve(dirname(absolute), target))) throw new Error(`Symlink target cannot be isolated: ${path}`);
      result.set(path, { type: 'symlink', target });
    } else if (stat.isFile()) {
      total += stat.size;
      if (stat.size > 64 * 1024 * 1024 || total > 256 * 1024 * 1024) throw new Error('Baseline exceeds 64 MiB per file or 256 MiB total');
      result.set(path, { type: 'file', hash: sha(readFileSync(absolute)), executable: Boolean(stat.mode & 0o111) });
    } else throw new Error(`Unsupported baseline file type: ${path}`);
  }
  return result;
}

/** P1 preparation only. Worktrees share Git objects; this is not an OS sandbox. */
export class GitWorkspace {
  constructor(workspace) {
    this.root = realpathSync(workspace);
    if (decode(git(this.root, ['rev-parse', '--show-prefix'])) !== '\n') throw new Error('P1 workspace must be the Git repository root');
    this.head = () => line(git(this.root, ['rev-parse', '--verify', 'HEAD^{commit}']));
    this.head(); // Refuse unborn repositories before making preparation records.
    this.commonDir = realpathSync(line(git(this.root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
    if (git(this.root, ['ls-files', '-z', '--', '.codex-teams']).length || fields(git(this.root, ['ls-tree', '-r', '--name-only', '-z', this.head()])).some(path => path === '.codex-teams' || path.startsWith('.codex-teams/'))) throw new Error('.codex-teams is reserved and must not be tracked');
    this.managed = join(this.root, '.codex-teams');
    safeDirectory(this.managed);
    this.worktrees = join(this.managed, 'worktrees');
    safeDirectory(this.worktrees);
  }
  path(id) { return join(this.worktrees, idSchema.parse(id)); }
  ref(id) { return `refs/codex-teams/workspaces/${idSchema.parse(id)}`; }
  source() {
    const head = this.head();
    if (line(git(this.root, ['config', '--bool', '--get', 'core.sparseCheckout'], { optional: true }) ?? Buffer.from('false')) === 'true') throw new Error('Sparse-checkout repositories are unsupported');
    const index = git(this.root, ['ls-files', '--stage', '-z']);
    if (fields(index).some(entry => entry.startsWith('160000 ') || !/^[0-9]{6} [a-f0-9]+ 0\t/s.test(entry))) throw new Error('Submodules and unmerged indexes are unsupported');
    const flags = git(this.root, ['ls-files', '-v', '-z']);
    if (fields(flags).some(entry => entry.startsWith('S ') || /^[a-z] /.test(entry))) throw new Error('Sparse/skip-worktree and assume-unchanged indexes are unsupported');
    const paths = [...new Set([...fields(git(this.root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', ...excluded])), ...fields(git(this.root, ['ls-tree', '-r', '--name-only', '-z', head]))])].sort();
    if (paths.length > 10000) throw new Error('Baseline exceeds 10000 files');
    rejectFilters(this.root, paths);
    const status = git(this.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...excluded]);
    const files = fileManifest(this.root, paths);
    return { head, indexDigest: sha(Buffer.concat([index, flags])), changes: statuses(status), files,
      digest: sha(JSON.stringify([head, sha(index), sha(flags), decode(status), [...files]])) };
  }
  prepare(record, dirtyPolicy, onBaseline) {
    const before = this.source();
    if (before.changes.length && dirtyPolicy === 'reject') throw new Error('Workspace has uncommitted changes; choose dirtyPolicy snapshot explicitly');
    const temporary = mkdtempSync(join(this.managed, 'baseline-'));
    try {
      const env = { GIT_INDEX_FILE: join(temporary, 'index') };
      git(this.root, ['read-tree', before.head], { env });
      if (before.files.size) git(this.root, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { env: { ...env, GIT_LITERAL_PATHSPECS: '1' }, input: Buffer.from([...before.files.keys()].join('\0') + '\0') });
      const tree = line(git(this.root, ['write-tree'], { env }));
      if (this.source().digest !== before.digest) throw new Error('Source changed during baseline capture; prepare again');
      const parentTree = line(git(this.root, ['rev-parse', `${before.head}^{tree}`]));
      const commit = tree === parentTree ? before.head : line(git(this.root, ['commit-tree', tree, '-p', before.head], {
        env: { GIT_AUTHOR_NAME: 'Codex Agent Teams', GIT_AUTHOR_EMAIL: 'codex-agent-teams@localhost', GIT_COMMITTER_NAME: 'Codex Agent Teams', GIT_COMMITTER_EMAIL: 'codex-agent-teams@localhost' },
        input: `Codex Agent Teams baseline ${record.id}\n`,
      }));
      record.baseline = { head: before.head, tree, commit, ref: this.ref(record.id), dirtyPolicy,
        sourceDigest: before.digest, indexDigest: before.indexDigest, changes: before.changes, files: [...before.files].filter(([, file]) => file.type !== 'missing') };
      onBaseline(record);
      git(this.root, ['update-ref', record.baseline.ref, commit, '0'.repeat(commit.length)]);
      git(this.root, ['worktree', 'add', '--detach', '--', record.worktreePath, commit]);
      this.identity(record);
      const paths = fields(git(this.root, ['ls-tree', '-r', '--name-only', '-z', tree]));
      const actual = fileManifest(record.worktreePath, paths);
      if (paths.some(path => JSON.stringify(before.files.get(path)) !== JSON.stringify(actual.get(path)))) throw new Error('Checkout differs from source bytes or permissions; baseline is not exact');
      if (this.source().digest !== before.digest) throw new Error('Source changed during worktree preparation; prepare again');
      return record;
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  identity(record) {
    if (record.repoRoot !== this.root || record.worktreePath !== this.path(record.id) || record.baseline?.ref !== this.ref(record.id) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.baseline?.commit ?? '')) throw new Error('Workspace record path or repository identity mismatch');
    safeDirectory(this.managed);
    safeDirectory(this.worktrees);
    if (!existsSync(record.worktreePath) || lstatSync(record.worktreePath).isSymbolicLink() || !lstatSync(record.worktreePath).isDirectory()) throw new Error('Managed worktree is missing or replaced');
    const registrations = fields(git(this.root, ['worktree', 'list', '--porcelain', '-z']));
    if (!registrations.includes(`worktree ${record.worktreePath}`)) throw new Error('Managed worktree is no longer registered');
    if (realpathSync(line(git(record.worktreePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']))) !== this.commonDir || decode(git(record.worktreePath, ['rev-parse', '--show-prefix'])) !== '\n') throw new Error('Worktree Git metadata points to another repository');
    const metadata = join(record.worktreePath, '.git');
    if (!lstatSync(metadata).isFile() || lstatSync(metadata).isSymbolicLink()) throw new Error('Worktree Git file was replaced');
    const gitDir = realpathSync(line(git(record.worktreePath, ['rev-parse', '--absolute-git-dir'])));
    if (!inside(join(this.commonDir, 'worktrees'), gitDir) || readFileSync(join(gitDir, 'gitdir'), 'utf8').replace(/\n$/, '') !== metadata) throw new Error('Worktree Git back-pointer identity mismatch');
    if (line(git(this.root, ['rev-parse', '--verify', record.baseline.ref])) !== record.baseline.commit) throw new Error('Baseline reference was changed; refusing to operate');
  }
  inspect(record, { allowedPaths } = {}) {
    this.identity(record);
    const candidates = fields(git(record.worktreePath, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
    rejectFilters(record.worktreePath, candidates);
    const head = line(git(record.worktreePath, ['rev-parse', 'HEAD']));
    const changed = fields(git(record.worktreePath, ['diff', '--name-only', '--no-ext-diff', '--no-renames', '-z', record.baseline.commit, '--']));
    const currentFiles = fileManifest(record.worktreePath, [...new Set([...record.baseline.files.map(([path]) => path), ...candidates])].sort());
    const contentChanged = record.baseline.files.filter(([path, file]) => JSON.stringify(file) !== JSON.stringify(currentFiles.get(path))).map(([path]) => path);
    const status = statuses(git(record.worktreePath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching']));
    const paths = [...new Set([...changed, ...contentChanged, ...status.flatMap(entry => [entry.path, ...(entry.originalPath ? [entry.originalPath] : [])])])].sort();
    const outOfScope = allowedPaths ? paths.filter(path => !allowedPaths.some(allowed => path === allowed || path.startsWith(allowed + '/'))) : [];
    let sourceChanged = true, sourceCheckError;
    try { sourceChanged = this.source().digest !== record.baseline.sourceDigest; }
    catch (error) { sourceCheckError = error.message; }
    return { at: new Date().toISOString(), head, contentDigest: sha(JSON.stringify([head, [...currentFiles]])), changes: status, changedPaths: paths, headChanged: head !== record.baseline.commit, inputPaths: [...new Set([...changed, ...contentChanged, ...status.filter(entry => entry.status !== '!!').flatMap(entry => [entry.path, ...(entry.originalPath ? [entry.originalPath] : [])])])].sort(),
      sourceChanged, ...(sourceCheckError ? { sourceCheckError } : {}), scopeChecked: Boolean(allowedPaths), outOfScope,
      clean: paths.length === 0 && head === record.baseline.commit };
  }
  captureTree(root, parent) {
    const paths = [...new Set([...fields(git(root, ['ls-tree', '-r', '--name-only', '-z', parent])), ...fields(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', ...excluded]))])].sort();
    rejectFilters(root, paths);
    const temp = mkdtempSync(join(this.managed, 'candidate-'));
    try {
      const env = { GIT_INDEX_FILE: join(temp, 'index'), GIT_LITERAL_PATHSPECS: '1' };
      git(root, ['read-tree', parent], { env });
      if (paths.length) git(root, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, input: Buffer.from(paths.join('\0') + '\0') });
      return line(git(root, ['write-tree'], { env }));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  candidate(record, allowedPaths) {
    const audit = this.inspect(record);
    if (audit.headChanged || audit.sourceChanged) throw new Error('Member changed HEAD or source workspace; refusing candidate');
    const out = audit.changedPaths.filter(path => !allowedPaths.some(allowed => path === allowed || path.startsWith(allowed + '/')));
    if (out.length) throw new Error(`Write scope exceeded: ${out.join(', ')}`);
    if (!audit.inputPaths.length) throw new Error('Write task produced no patch');
    const tree = this.captureTree(record.worktreePath, record.baseline.commit);
    const patch = git(this.root, ['diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', record.baseline.tree, tree, '--']);
    if (!patch.length || patch.length > 1024 * 1024) throw new Error('Candidate patch must be nonempty and at most 1 MiB');
    const dir = join(this.managed, 'patches'); safeDirectory(dir);
    const patchPath = join(dir, `${record.id}.patch`);
    writeFileSync(patchPath, patch, { flag: 'wx', mode: 0o600 });
    if (this.inspect(record).contentDigest !== audit.contentDigest) throw new Error('Candidate changed while capturing patch');
    return { tree, digest: audit.contentDigest, paths: audit.inputPaths, patchPath, patchDigest: sha(patch) };
  }
  candidateEvidence(record, candidate) {
    this.identity(record);
    if (candidate.patchPath !== join(this.managed, 'patches', `${record.id}.patch`) || lstatSync(dirname(candidate.patchPath)).isSymbolicLink() || lstatSync(candidate.patchPath).isSymbolicLink()) throw new Error('Candidate patch path was replaced');
    const patch = readFileSync(candidate.patchPath);
    if (patch.length > 1024 * 1024 || sha(patch) !== candidate.patchDigest || this.inspect(record).contentDigest !== candidate.digest) throw new Error('Candidate or patch evidence changed');
    return patch;
  }
  applyCandidate(record, candidate) {
    const patch = this.candidateEvidence(record, candidate);
    if (this.source().digest !== record.baseline.sourceDigest) throw new Error('Source workspace changed since baseline; integrate refused without modifying it');
    git(this.root, ['apply', '--check', '--binary', '-'], { input: patch });
    // Repeat the fingerprint after preflight; apply does not stage, commit or merge.
    if (this.source().digest !== record.baseline.sourceDigest) throw new Error('Source changed during integration preflight');
    git(this.root, ['apply', '--binary', '-'], { input: patch });
    const actual = this.source();
    if (actual.head !== record.baseline.head || actual.indexDigest !== record.baseline.indexDigest || this.captureTree(this.root, actual.head) !== candidate.tree) throw new Error('Integration content or index differs; changes retained for recovery');
    return actual.digest;
  }
  remove(record, { discard }) {
    if (record.repoRoot !== this.root || record.worktreePath !== this.path(record.id)) throw new Error('Workspace record path or repository identity mismatch');
    safeDirectory(this.managed); safeDirectory(this.worktrees);
    const registered = fields(git(this.root, ['worktree', 'list', '--porcelain', '-z'])).includes(`worktree ${record.worktreePath}`);
    if (!registered && !existsSync(record.worktreePath) && !['ready'].includes(record.statusBeforeRemoval)) {
      const ref = this.ref(record.id);
      const present = git(this.root, ['show-ref', '--verify', '--quiet', ref], { optional: true }) !== null;
      if (present) {
        if (record.baseline?.ref !== ref || line(git(this.root, ['rev-parse', ref])) !== record.baseline.commit) throw new Error('Incomplete workspace baseline ref identity mismatch');
        git(this.root, ['update-ref', '-d', ref, record.baseline.commit]);
      }
      return { at: new Date().toISOString(), preparationIncomplete: true, clean: true };
    }
    const audit = this.inspect(record);
    if (!discard && !audit.clean) throw new Error('Worktree contains changes or new commits; inspect it or explicitly discard');
    // Git removes only the verified, registered worktree; never recursively delete arbitrary paths.
    git(this.root, ['worktree', 'remove', ...(discard ? ['--force'] : []), '--', record.worktreePath]);
    git(this.root, ['update-ref', '-d', record.baseline.ref, record.baseline.commit]);
    return audit;
  }
}
