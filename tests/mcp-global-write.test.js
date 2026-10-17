import { writeFixtureExecutable } from './fixtures/coverage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readSnapshot } from '../src/status.js';

test('global SDK connection writes, reviews and integrates two Git projects into the correct sources', { timeout: 60000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-mcp-global-write-')));
  const projects = ['project A', '项目 B'].map(name => {
    const workspace = join(root, name);
    mkdirSync(workspace);
    const git = args => execFileSync('git', ['-C', workspace, ...args], { encoding: 'utf8', stdio: 'pipe' });
    git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@localhost']);
    writeFileSync(join(workspace, '.gitignore'), '.codex-teams/\n');
    writeFileSync(join(workspace, 'sum.js'), 'export const sum = (a, b) => a - b;\n');
    writeFileSync(join(workspace, 'package.json'), '{"type":"module"}\n');
    writeFileSync(join(workspace, 'sum.test.js'), "import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.js';test('sum',()=>{assert.equal(sum(2,3),5);assert.equal(sum(-2,3),1);assert.equal(sum(0,0),0);});\n");
    writeFileSync(join(workspace, 'user.txt'), `${name} baseline\n`);
    git(['add', '.']); git(['commit', '-m', 'initial']);
    writeFileSync(join(workspace, 'user.txt'), `${name} staged\n`); git(['add', 'user.txt']);
    const userContent = `${name} unstaged\n`;
    writeFileSync(join(workspace, 'user.txt'), userContent);
    return { workspace, git, userContent, head: git(['rev-parse', 'HEAD']), index: readFileSync(join(workspace, '.git/index')) };
  });
  const binary = join(root, 'controlled-write-codex'), configPath = join(root, 'global.config.json');
  writeFixtureExecutable(binary, `#!/usr/bin/env node\nprocess.argv[2]='write-runtime';await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  writeFileSync(configPath, JSON.stringify({ codexBin: binary, maxConcurrency: 2, taskTimeoutMs: 30000, profiles: { expert: { model: 'test-model', effort: 'high' } } }));
  const forms = [];
  const client = new Client({ name: 'global-write-tests', version: '1' }, { capabilities: { elicitation: { form: {} } } });
  client.setRequestHandler('elicitation/create', async request => {
    const project = projects.find(item => request.params.message.includes(item.workspace));
    assert.ok(project, 'each user form must name the selected source checkout');
    forms.push(project.workspace);
    return { action: 'accept', content: {
      expert: JSON.stringify({ model: 'test-model', effort: 'high' }), simple: JSON.stringify({ model: 'configured-model', effort: 'high' }), confirm: true, remember: false,
    } };
  });
  t.after(async () => {
    await client.close();
    const deadline = Date.now() + 3000;
    while (projects.some(item => existsSync(join(item.workspace, '.codex-teams/state.sqlite')) && readSnapshot(item.workspace).owner) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(projects.every(item => !existsSync(join(item.workspace, '.codex-teams/state.sqlite')) || !readSnapshot(item.workspace).owner), 'all project owners must be released before cleanup');
    rmSync(root, { recursive: true, force: true });
  });
  // cwd is an unrelated directory, so neither source can be chosen by the CLI launch location.
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], cwd: root, stderr: 'pipe' }));
  const call = async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    assert.ok(!response.isError, JSON.stringify(response.content));
    return JSON.parse(response.content[0].text);
  };
  const acceptance = ['sum returns the sum of its arguments'];
  const assertPreserved = project => {
    assert.equal(project.git(['rev-parse', 'HEAD']), project.head);
    assert.deepEqual(readFileSync(join(project.workspace, '.git/index')), project.index);
    assert.equal(readFileSync(join(project.workspace, 'user.txt'), 'utf8'), project.userContent);
  };
  assert.equal((await client.listTools()).tools.length, 8);
  for (const project of projects) {
    const models = await call('teams_models', { workspace: project.workspace });
    assert.equal(models.workspace, project.workspace);
    assert.equal(models.confirmationRequired, true);
    assert.equal((await call('teams_status', { workspace: project.workspace, overview: true })).counts.total, 0);
    assert.equal(existsSync(join(project.workspace, '.codex-teams')), false, 'read-only discovery must not create an owner');
    await call('teams_models', { workspace: project.workspace, confirm: true });
    project.task = await call('teams_create', { expectedWorkspace: project.workspace, objective: 'Fix sum in sum.js', kind: 'implementation', complexity: 'simple', mode: 'workspace-write', acceptance,
      executionPlan: { dirtyPolicy: 'snapshot', allowedPaths: ['sum.js'], verification: { command: process.execPath, args: ['--test', 'sum.test.js'], timeoutMs: 5000 } },
    });
  }
  assert.deepEqual(forms, projects.map(project => project.workspace));
  await Promise.all(projects.map(project => call('teams_start', { taskId: project.task.id })));
  for (const project of projects) {
    const ready = await call('teams_wait', { taskId: project.task.id, timeoutMs: 30000, verbose: true });
    assert.equal(ready.status, 'awaiting_review', ready.error);
    assert.equal(ready.target.root, project.workspace);
    project.attempt = ready.attempts[0];
    assert.equal(project.attempt.actualModel, 'configured-model');
    assert.equal(project.attempt.machineReview.actualModel, 'test-model');
    assert.equal(project.attempt.machineReview.status, 'passed');
    assert.notEqual(project.attempt.threadId, project.attempt.machineReview.threadId);
    assert.equal(project.attempt.modelConfirmation.target.root, project.workspace);
    assert.equal(project.attempt.modelConfirmation.scope, 'runtime-session');
    const compact = await call('teams_status', { taskId: project.task.id });
    assert.equal(compact.verification.status, 'passed');
    assert.ok(compact.evidence.workspacePath.startsWith(project.workspace + '/'));
    assert.match(readFileSync(compact.verification.stdoutPath, 'utf8'), /pass 1/);
    assert.match(readFileSync(join(project.workspace, 'sum.js'), 'utf8'), /a - b/);
    assertPreserved(project);
    const approved = await call('teams_review', { workspace: project.workspace, taskId: project.task.id, attemptId: project.attempt.id, verdict: 'pass', evidence: [{ criterion: acceptance[0], evidence: 'Captain checked controlled writer patch, controlled expert review and the real positive/negative/zero sum test log.' }] });
    assert.equal(approved.status, 'awaiting_integration');
  }
  const [a, b] = projects;
  const wrong = await client.callTool({ name: 'teams_integrate', arguments: { workspace: b.workspace, taskId: a.task.id, attemptId: a.attempt.id } });
  assert.equal(wrong.isError, true);
  assert.match(wrong.content[0].text, /another workspace|mismatch/i);
  for (const project of projects) {
    assert.equal((await call('teams_status', { taskId: project.task.id })).status, 'awaiting_integration');
    assert.match(readFileSync(join(project.workspace, 'sum.js'), 'utf8'), /a - b/);
    assertPreserved(project);
  }
  await call('teams_integrate', { taskId: a.task.id, attemptId: a.attempt.id });
  assert.equal((await call('teams_wait', { taskId: a.task.id, timeoutMs: 30000 })).status, 'succeeded');
  assert.match(readFileSync(join(a.workspace, 'sum.js'), 'utf8'), /a\+b/);
  assert.match(readFileSync(join(b.workspace, 'sum.js'), 'utf8'), /a - b/);
  assert.equal((await call('teams_status', { taskId: b.task.id })).status, 'awaiting_integration');
  projects.forEach(assertPreserved);
  await call('teams_integrate', { taskId: b.task.id, attemptId: b.attempt.id });
  assert.equal((await call('teams_wait', { taskId: b.task.id, timeoutMs: 30000 })).status, 'succeeded');
  for (const project of projects) {
    assert.match(readFileSync(join(project.workspace, 'sum.js'), 'utf8'), /a\+b/);
    assertPreserved(project);
    const compact = await call('teams_status', { taskId: project.task.id });
    assert.equal(compact.integrationVerification.status, 'passed');
    assert.match(readFileSync(compact.integrationVerification.stdoutPath, 'utf8'), /pass 1/);
    assert.equal((await call('teams_status', { workspace: project.workspace, overview: true })).counts.succeeded, 1);
    await call('teams_cancel', { taskId: project.task.id, cleanup: true, discard: true });
    assert.equal((await call('teams_status', { taskId: project.task.id })).status, 'succeeded');
  }
});
