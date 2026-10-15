import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { GitWorkspace } from '../src/workspace.js';

const run = (root, args, options = {}) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe', ...options });
function fixture(t, { ignoreManagement = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-git-')));
  const repo = join(root, '仓库 with spaces');
  mkdirSync(repo);
  run(repo, ['init', '-b', 'main']);
  run(repo, ['config', 'user.name', 'Test']); run(repo, ['config', 'user.email', 'test@localhost']);
  writeFileSync(join(repo, '.gitignore'), `${ignoreManagement ? '.codex-teams/\n' : ''}ignored.txt\n`);
  writeFileSync(join(repo, 'tracked.txt'), 'original\n');
  writeFileSync(join(repo, 'delete.txt'), 'delete later\n');
  run(repo, ['add', '.']); run(repo, ['commit', '-m', 'initial']);
  const config = { workspace: repo, profiles: { expert: { model: 'not-called' } }, maxConcurrency: 2, taskTimeoutMs: 1000 };
  let runtime;
  const open = () => runtime = new TaskRuntime(new TaskStore(join(repo, '.codex-teams', 'state.sqlite')), { run: () => { throw new Error('No model may be called'); } }, config);
  open();
  t.after(async () => { await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, repo, config, get runtime() { return runtime; }, reopen: async () => { await runtime.close(); return open(); } };
}

function origin(repo) {
  return { head: run(repo, ['rev-parse', 'HEAD']), index: readFileSync(join(repo, '.git', 'index')),
    status: run(repo, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']),
    text: readFileSync(join(repo, 'tracked.txt')) };
}

test('bidirectional file/directory changes support snapshot, candidate, apply and explicit discard', async t => {
  for (const direction of ['file-to-directory', 'directory-to-file']) for (const staged of [false, true]) {
    await t.test(`${direction}, staged=${staged}`, async t => {
      const f = fixture(t), entry = join(f.repo, 'entry');
      const beforeDirectory = direction === 'directory-to-file';
      if (beforeDirectory) mkdirSync(entry);
      writeFileSync(beforeDirectory ? join(entry, 'index.js') : entry, 'before');
      run(f.repo, ['add', 'entry']); run(f.repo, ['commit', '-m', 'entry baseline']);
      const head = run(f.repo, ['rev-parse', 'HEAD']), index = readFileSync(join(f.repo, '.git/index'));
      const convert = root => {
        const path = join(root, 'entry'); rmSync(path, { recursive: true, force: true });
        if (!beforeDirectory) mkdirSync(path);
        writeFileSync(beforeDirectory ? path : join(path, 'index.js'), 'after');
      };
      const record = f.runtime.prepareWorkspace(), manager = new GitWorkspace(f.repo);
      convert(record.worktreePath);
      if (staged) run(record.worktreePath, ['add', '-A', '--', 'entry']);
      const audit = manager.inspect(record, { allowedPaths: ['entry'] });
      assert.deepEqual(audit.outOfScope, []);
      assert.throws(() => manager.candidate(record, ['tracked.txt']), /Write scope exceeded/);
      const candidate = manager.candidate(record, ['entry']);
      const check = await f.runtime.verifyWorkspace(record.id, { command: process.execPath, args: ['-e', "if(require('node:fs').readFileSync(process.argv[1],'utf8')!=='after')process.exit(1)", beforeDirectory ? 'entry' : 'entry/index.js'] });
      assert.equal(check.status, 'passed');
      manager.applyCandidate(record, candidate);
      assert.equal(readFileSync(beforeDirectory ? entry : join(entry, 'index.js'), 'utf8'), 'after');
      assert.equal(run(f.repo, ['rev-parse', 'HEAD']), head);
      assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
      assert.equal(f.runtime.removeWorkspace(record.id, { discard: true }).status, 'removed');
      // Capture the same dirty source shape without altering its existing index.
      const sourceIndex = readFileSync(join(f.repo, '.git/index'));
      const snapshot = f.runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' });
      assert.equal(readFileSync(join(snapshot.worktreePath, beforeDirectory ? 'entry' : 'entry/index.js'), 'utf8'), 'after');
      assert.deepEqual(readFileSync(join(f.repo, '.git/index')), sourceIndex);
      f.runtime.removeWorkspace(snapshot.id);
    });
  }
});

test('clean baseline creates an independent detached worktree, persists receipt and removes only its own artifacts', async t => {
  const f = fixture(t), before = origin(f.repo);
  const prepared = f.runtime.prepareWorkspace();
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.baseline.head + '\n', before.head);
  assert.equal(prepared.baseline.commit, prepared.baseline.head);
  assert.equal(run(prepared.worktreePath, ['rev-parse', 'HEAD']).trim(), prepared.baseline.commit);
  assert.equal(spawnSync('git', ['-C', prepared.worktreePath, 'symbolic-ref', '-q', 'HEAD']).status, 1);
  writeFileSync(join(prepared.worktreePath, 'tracked.txt'), 'member edit\n');
  assert.deepEqual(origin(f.repo), before);
  const audit = f.runtime.inspectWorkspace(prepared.id, { allowedPaths: ['delete.txt'] }).lastInspection;
  assert.deepEqual(audit.changedPaths, ['tracked.txt']);
  assert.deepEqual(audit.outOfScope, ['tracked.txt']);
  assert.equal(audit.sourceChanged, false);
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).status, 'ready');
  assert.throws(() => f.runtime.removeWorkspace(prepared.id), /contains changes/);
  assert.equal(existsSync(prepared.worktreePath), true);
  assert.equal(f.runtime.removeWorkspace(prepared.id, { discard: true }).status, 'removed');
  assert.equal(existsSync(prepared.worktreePath), false);
  assert.equal(run(f.repo, ['worktree', 'list', '--porcelain']).split('worktree ').length - 1, 1);
  assert.deepEqual(origin(f.repo), before);
});

test('dirty repositories are refused by default and failures are persisted', t => {
  const { repo, runtime } = fixture(t);
  writeFileSync(join(repo, 'tracked.txt'), 'unstaged\n');
  const before = origin(repo);
  assert.throws(() => runtime.prepareWorkspace(), /snapshot explicitly/);
  const records = runtime.workspaceStatus();
  assert.equal(records.length, 1); assert.equal(records[0].status, 'failed');
  assert.equal(records[0].baseline, undefined);
  assert.equal(runtime.removeWorkspace(records[0].id).status, 'removed');
  assert.deepEqual(origin(repo), before);
  assert.equal(run(repo, ['worktree', 'list', '--porcelain']).split('worktree ').length - 1, 1);
});

test('snapshot captures staged, unstaged, binary, deleted and untracked files without staging or stashing the source', t => {
  const { repo, runtime } = fixture(t);
  writeFileSync(join(repo, 'tracked.txt'), 'staged\n'); run(repo, ['add', 'tracked.txt']);
  writeFileSync(join(repo, 'tracked.txt'), 'staged plus unstaged\n');
  rmSync(join(repo, 'delete.txt')); run(repo, ['add', '-u', 'delete.txt']);
  const oddName = '新增\n带空格.txt';
  writeFileSync(join(repo, oddName), Buffer.from([0, 255, 10, 1]));
  writeFileSync(join(repo, 'ignored.txt'), 'local secret');
  const before = origin(repo);
  const prepared = runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' });
  assert.equal(prepared.status, 'ready');
  assert.notEqual(prepared.baseline.commit, prepared.baseline.head);
  assert.equal(readFileSync(join(prepared.worktreePath, 'tracked.txt'), 'utf8'), 'staged plus unstaged\n');
  assert.deepEqual(readFileSync(join(prepared.worktreePath, oddName)), Buffer.from([0, 255, 10, 1]));
  assert.equal(existsSync(join(prepared.worktreePath, 'delete.txt')), false);
  assert.equal(existsSync(join(prepared.worktreePath, 'ignored.txt')), false);
  assert.equal(existsSync(join(prepared.worktreePath, '.codex-teams')), false);
  assert.deepEqual(origin(repo), before);
  assert.equal(runtime.inspectWorkspace(prepared.id).lastInspection.clean, true);
  assert.equal(runtime.removeWorkspace(prepared.id).status, 'removed');
  assert.deepEqual(origin(repo), before);
});

test('management data stays out of snapshots even when the target repository has no ignore entry', t => {
  const { repo, runtime } = fixture(t, { ignoreManagement: false });
  writeFileSync(join(repo, 'new.txt'), 'new');
  const prepared = runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' });
  assert.equal(prepared.baseline.changes.some(entry => entry.path.startsWith('.codex-teams')), false);
  assert.equal(run(prepared.worktreePath, ['ls-files']).includes('.codex-teams'), false);
  runtime.removeWorkspace(prepared.id);
});

test('two preparations have separate indexes and files; cleanup preserves an unrelated worktree', t => {
  const { root, repo, runtime } = fixture(t);
  const unrelated = join(root, 'user-worktree');
  run(repo, ['worktree', 'add', '--detach', unrelated, 'HEAD']);
  const first = runtime.prepareWorkspace(), second = runtime.prepareWorkspace();
  writeFileSync(join(first.worktreePath, 'tracked.txt'), 'first-only');
  run(first.worktreePath, ['add', 'tracked.txt']);
  assert.equal(readFileSync(join(second.worktreePath, 'tracked.txt'), 'utf8'), 'original\n');
  assert.equal(runtime.inspectWorkspace(second.id).lastInspection.clean, true);
  runtime.removeWorkspace(second.id);
  runtime.removeWorkspace(first.id, { discard: true });
  assert.equal(existsSync(unrelated), true);
});

test('scope audit accounts for rename source, destination and ignored/untracked files', t => {
  const { runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  run(prepared.worktreePath, ['mv', 'tracked.txt', 'renamed.txt']);
  writeFileSync(join(prepared.worktreePath, 'ignored.txt'), 'generated');
  writeFileSync(join(prepared.worktreePath, 'new.txt'), 'untracked');
  assert.throws(() => runtime.inspectWorkspace(prepared.id, { allowedPaths: ['../outside'] }));
  const audit = runtime.inspectWorkspace(prepared.id, { allowedPaths: ['renamed.txt'] }).lastInspection;
  assert.ok(audit.changedPaths.includes('tracked.txt'));
  assert.deepEqual(audit.outOfScope, ['ignored.txt', 'new.txt', 'tracked.txt']);
  assert.throws(() => runtime.removeWorkspace(prepared.id), /contains changes/);
  runtime.removeWorkspace(prepared.id, { discard: true });
});

test('committed changes and ignored-only output cannot be silently removed', t => {
  const { runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  writeFileSync(join(prepared.worktreePath, 'tracked.txt'), 'committed change');
  run(prepared.worktreePath, ['add', '.']); run(prepared.worktreePath, ['commit', '-m', 'member work']);
  const audit = runtime.inspectWorkspace(prepared.id).lastInspection;
  assert.equal(audit.headChanged, true); assert.equal(audit.clean, false);
  assert.deepEqual(audit.changedPaths, ['tracked.txt']);
  assert.throws(() => runtime.removeWorkspace(prepared.id), /new commits/);
  runtime.removeWorkspace(prepared.id, { discard: true });
  const ignored = runtime.prepareWorkspace();
  writeFileSync(join(ignored.worktreePath, 'ignored.txt'), 'only ignored');
  assert.throws(() => runtime.removeWorkspace(ignored.id), /contains changes/);
  runtime.removeWorkspace(ignored.id, { discard: true });
});

test('byte-level audit catches changes hidden by assume-unchanged Git flags', t => {
  const { runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  run(prepared.worktreePath, ['update-index', '--assume-unchanged', 'tracked.txt']);
  writeFileSync(join(prepared.worktreePath, 'tracked.txt'), 'hidden change');
  assert.equal(run(prepared.worktreePath, ['status', '--porcelain']), '');
  assert.deepEqual(runtime.inspectWorkspace(prepared.id).lastInspection.changedPaths, ['tracked.txt']);
  assert.throws(() => runtime.removeWorkspace(prepared.id), /contains changes/);
  runtime.removeWorkspace(prepared.id, { discard: true });
});

test('source edits after capture are reported without preventing safe clean worktree removal', t => {
  const { repo, runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  writeFileSync(join(repo, 'tracked.txt'), 'later user edit');
  assert.equal(runtime.inspectWorkspace(prepared.id).lastInspection.sourceChanged, true);
  runtime.removeWorkspace(prepared.id);
  assert.equal(readFileSync(join(repo, 'tracked.txt'), 'utf8'), 'later user edit');
});

test('symlinked managed state directory/database and forged worktree paths are refused', t => {
  const { root, repo, runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  const outside = join(root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'keep.txt'), 'keep');
  const forged = runtime.workspaceStatus(prepared.id); forged.worktreePath = outside;
  runtime.store.saveWorkspace(forged, 'test-forged-path');
  assert.throws(() => runtime.removeWorkspace(prepared.id, { discard: true }), /identity mismatch/);
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'keep');
  runtime.store.saveWorkspace(prepared, 'test-restore-path'); runtime.removeWorkspace(prepared.id);
  const redirected = join(root, 'redirected'); mkdirSync(redirected);
  const stateLink = join(redirected, '.codex-teams'); symlinkSync(outside, stateLink);
  assert.throws(() => new TaskStore(join(stateLink, 'state.sqlite')), /must not be symlinks/);
  assert.equal(existsSync(join(outside, 'state.sqlite')), false);
  const databaseLink = join(redirected, 'db-link.sqlite'); symlinkSync(join(repo, '.codex-teams/state.sqlite'), databaseLink);
  assert.throws(() => new TaskStore(databaseLink), /must not be symlinks/);
});

for (const flag of ['--assume-unchanged', '--skip-worktree']) {
  test(`source ${flag} flags cannot hide missing baseline content`, t => {
    const { repo, runtime } = fixture(t);
    run(repo, ['update-index', flag, 'tracked.txt']);
    assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /indexes are unsupported/);
  });
}

test('absolute/escaping symlinks and external Git filters fail before creating a worktree', t => {
  const { root, repo, runtime } = fixture(t);
  symlinkSync(join(root, 'outside'), join(repo, 'unsafe-link'));
  assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /cannot be isolated/);
  rmSync(join(repo, 'unsafe-link'));
  writeFileSync(join(repo, '.gitattributes'), '*.txt filter=side-effect\n');
  run(repo, ['config', 'filter.side-effect.clean', 'touch filter-ran; cat']);
  assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /filters are unsupported/);
  assert.equal(existsSync(join(repo, 'filter-ran')), false);
});

test('unborn repositories, subdirectories, tracked management files and unmerged indexes are refused', t => {
  const { root, repo, runtime } = fixture(t);
  const unborn = join(root, 'unborn'); mkdirSync(unborn); run(unborn, ['init']);
  assert.throws(() => new GitWorkspace(unborn), /Git rev-parse failed/);
  const subdir = join(repo, 'subdir'); mkdirSync(subdir);
  assert.throws(() => new GitWorkspace(subdir), /repository root/);
  writeFileSync(join(repo, '.codex-teams/reserved.txt'), 'reserved'); run(repo, ['add', '-f', '.codex-teams/reserved.txt']);
  assert.throws(() => runtime.prepareWorkspace(), /must not be tracked/);
  run(repo, ['reset', '--', '.codex-teams/reserved.txt']);
  const blob = run(repo, ['rev-parse', 'HEAD:tracked.txt']).trim();
  run(repo, ['update-index', '--index-info'], { input: `0 ${'0'.repeat(blob.length)}\ttracked.txt\n100644 ${blob} 1\ttracked.txt\n100644 ${blob} 2\ttracked.txt\n100644 ${blob} 3\ttracked.txt\n` });
  assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /unmerged indexes/);
});

test('changed baseline ref, removed registration and a symlink replacement block destructive cleanup', t => {
  const { root, repo, runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  const tree = run(repo, ['rev-parse', 'HEAD^{tree}']).trim();
  const other = run(repo, ['commit-tree', tree, '-p', 'HEAD'], { input: 'other commit\n' }).trim();
  run(repo, ['update-ref', prepared.baseline.ref, other]);
  assert.throws(() => runtime.removeWorkspace(prepared.id, { discard: true }), /reference was changed/);
  run(repo, ['update-ref', prepared.baseline.ref, prepared.baseline.commit]);
  const originalPath = prepared.worktreePath;
  const moved = join(root, 'moved-owned-worktree');
  run(repo, ['worktree', 'move', originalPath, moved]);
  symlinkSync(moved, originalPath);
  assert.throws(() => runtime.removeWorkspace(prepared.id, { discard: true }), /missing or replaced/);
  assert.ok(existsSync(join(moved, 'tracked.txt')));
  unlinkSync(originalPath); assert.ok(existsSync(join(moved, 'tracked.txt')));
  run(repo, ['worktree', 'move', moved, originalPath]);
  runtime.removeWorkspace(prepared.id);
});

test('abrupt exit marks workspace preparation/removal for recovery and never replays Git operations', async t => {
  const f = fixture(t), prepared = f.runtime.prepareWorkspace();
  await f.runtime.close();
  const script = `import { TaskStore } from ${JSON.stringify(new URL('../src/store.js', import.meta.url).href)}; const store=new TaskStore(${JSON.stringify(join(f.repo, '.codex-teams/state.sqlite'))}); const record=store.getWorkspace(${JSON.stringify(prepared.id)}); record.status='removing'; store.saveWorkspace(record,'injected-crash'); process.exit(7);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(child.status, 7);
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).status, 'recovery_required');
  assert.equal(existsSync(prepared.worktreePath), true);
  assert.equal(f.runtime.removeWorkspace(prepared.id).status, 'removed');
});

test('CLI preparation, audit and cleanup are persisted across processes without inference', async t => {
  const f = fixture(t);
  await f.runtime.close();
  const configPath = join(f.root, 'config.json'); writeFileSync(configPath, JSON.stringify(f.config));
  const cli = args => JSON.parse(execFileSync(process.execPath, [resolve('src/cli.js'), 'workspace', ...args, '--config', configPath], { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }));
  const prepared = cli(['prepare']);
  assert.equal(prepared.status, 'ready');
  assert.equal(cli(['list'])[0].id, prepared.id);
  assert.equal(cli(['inspect', '--id', prepared.id, '--allow', 'tracked.txt']).lastInspection.clean, true);
  assert.equal(cli(['remove', '--id', prepared.id]).status, 'removed');
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).status, 'removed');
});


test('changes during baseline capture are detected and never accepted', t => {
  const { repo, runtime } = fixture(t), before = origin(repo);
  const original = GitWorkspace.prototype.source;
  let count = 0;
  GitWorkspace.prototype.source = function () {
    const result = original.call(this);
    if (++count === 1) writeFileSync(join(repo, 'tracked.txt'), 'concurrent user edit');
    return result;
  };
  try { assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /Source changed during baseline capture/); }
  finally { GitWorkspace.prototype.source = original; }
  const record = runtime.workspaceStatus()[0];
  assert.equal(record.status, 'failed');
  assert.equal(existsSync(record.worktreePath), false);
  assert.equal(run(repo, ['rev-parse', 'HEAD']), before.head);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), before.index);
  assert.equal(readFileSync(join(repo, 'tracked.txt'), 'utf8'), 'concurrent user edit');
  runtime.removeWorkspace(record.id);
});

test('partial preparation with a pinned ref remains recorded and can be conservatively cleaned', t => {
  const { repo, runtime } = fixture(t);
  const original = GitWorkspace.prototype.identity;
  GitWorkspace.prototype.identity = function () { throw new Error('injected failure after checkout'); };
  try { assert.throws(() => runtime.prepareWorkspace(), /injected failure/); }
  finally { GitWorkspace.prototype.identity = original; }
  const record = runtime.workspaceStatus()[0];
  assert.equal(record.status, 'failed');
  assert.equal(existsSync(record.worktreePath), true);
  assert.equal(run(repo, ['rev-parse', record.baseline.ref]).trim(), record.baseline.commit);
  assert.equal(runtime.removeWorkspace(record.id).status, 'removed');
});

test('checkout hooks are disabled and relative internal symlinks retain their contents', t => {
  const { repo, runtime } = fixture(t);
  writeFileSync(join(repo, '.git/hooks/post-checkout'), '#!/bin/sh\ntouch hook-ran\n', { mode: 0o755 });
  symlinkSync('tracked.txt', join(repo, 'safe-link'));
  const prepared = runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' });
  assert.equal(readFileSync(join(prepared.worktreePath, 'safe-link'), 'utf8'), 'original\n');
  assert.equal(existsSync(join(repo, 'hook-ran')), false);
  assert.equal(existsSync(join(prepared.worktreePath, 'hook-ran')), false);
  runtime.removeWorkspace(prepared.id);
});


test('submodules and sparse-checkout configuration are refused explicitly', t => {
  const { repo, runtime } = fixture(t);
  const head = run(repo, ['rev-parse', 'HEAD']).trim();
  run(repo, ['update-index', '--add', '--cacheinfo', `160000,${head},module`]);
  assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /Submodules/);
  run(repo, ['update-index', '--force-remove', 'module']);
  run(repo, ['config', 'core.sparseCheckout', 'true']);
  assert.throws(() => runtime.prepareWorkspace(), /Sparse-checkout/);
});

test('a checkout that normalizes source bytes is never marked ready', t => {
  const { repo, runtime } = fixture(t);
  writeFileSync(join(repo, '.gitattributes'), 'tracked.txt text eol=lf\n');
  writeFileSync(join(repo, 'tracked.txt'), 'original\r\n');
  const before = origin(repo);
  assert.throws(() => runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' }), /Checkout differs from source bytes/);
  const record = runtime.workspaceStatus()[0];
  assert.equal(record.status, 'failed');
  assert.deepEqual(origin(repo), before);
  runtime.removeWorkspace(record.id, { discard: true });
  assert.deepEqual(origin(repo), before);
});

test('swapping a managed Git file to another worktree cannot bypass identity checks', t => {
  const { runtime } = fixture(t), first = runtime.prepareWorkspace(), second = runtime.prepareWorkspace();
  const metadata = join(first.worktreePath, '.git');
  const original = readFileSync(metadata);
  writeFileSync(metadata, readFileSync(join(second.worktreePath, '.git')));
  assert.throws(() => runtime.removeWorkspace(first.id, { discard: true }), /identity mismatch/);
  assert.equal(existsSync(first.worktreePath), true);
  assert.equal(existsSync(second.worktreePath), true);
  writeFileSync(metadata, original);
  runtime.removeWorkspace(first.id); runtime.removeWorkspace(second.id);
});

test('workspaces can be prepared from an existing linked worktree without touching the primary checkout', async t => {
  const { root, repo, config } = fixture(t);
  const linked = join(root, 'linked-source'); run(repo, ['worktree', 'add', '--detach', linked, 'HEAD']);
  const runtime = new TaskRuntime(new TaskStore(join(linked, '.codex-teams/state.sqlite')), {}, { ...config, workspace: linked });
  t.after(() => runtime.close());
  writeFileSync(join(linked, 'tracked.txt'), 'linked source edit');
  const prepared = runtime.prepareWorkspace({ dirtyPolicy: 'snapshot' });
  assert.equal(readFileSync(join(prepared.worktreePath, 'tracked.txt'), 'utf8'), 'linked source edit');
  assert.equal(readFileSync(join(repo, 'tracked.txt'), 'utf8'), 'original\n');
  runtime.removeWorkspace(prepared.id);
  await runtime.close();
});

test('capturing a patch tree does not itself change what the worktree digest reports', t => {
  // candidate() no longer re-inspects after captureTree because captureTree cannot move the worktree.
  // If captureTree ever starts touching worktree files, that removal would silently reopen the window,
  // so pin the invariant here rather than relying on the comment.
  const { runtime } = fixture(t), prepared = runtime.prepareWorkspace();
  const record = runtime.workspaceStatus(prepared.id);
  const manager = new GitWorkspace(runtime.config.workspace);
  writeFileSync(join(record.worktreePath, 'tracked.txt'), 'member edit\n');

  const before = manager.inspect(record).contentDigest;
  manager.captureTree(record.worktreePath, record.baseline.commit);
  const after = manager.inspect(record).contentDigest;
  assert.equal(after, before, 'captureTree must not change the worktree content digest');

  // And the downstream guard still catches a change that happens after the candidate was produced.
  const candidate = manager.candidate(record, ['tracked.txt']);
  writeFileSync(join(record.worktreePath, 'tracked.txt'), 'edit after capture\n');
  assert.throws(() => manager.candidateEvidence(record, candidate), /Candidate or patch evidence changed/);
});
