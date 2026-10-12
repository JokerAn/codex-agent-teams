import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('real SDK client connects over stdio; contracts validate before any paid call', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'teams-mcp-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspace: dir, profiles: { expert: { model: 'not-used-in-this-test' } } }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], stderr: 'pipe' });
  const client = new Client({ name: 'teams-tests', version: '0.1.0' });
  t.after(async () => { await client.close(); rmSync(dir, { recursive: true, force: true }); });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7);
  assert.equal(tools.tools.find(tool => tool.name === 'teams_start').annotations.destructiveHint, true);
  assert.equal(existsSync(join(dir, '.codex-teams')), false, 'MCP inventory must not acquire a workspace runtime');
  const created = await client.callTool({ name: 'teams_create', arguments: { objective: 'Inspect test config', acceptance: ['Cite config file'] } });
  assert.ok(!created.isError);
  const task = JSON.parse(created.content[0].text);
  assert.equal(task.profile, 'expert');
  const status = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(status.content[0].text).status, 'pending');
  const bound = await client.callTool({ name: 'teams_create', arguments: { objective: 'Read captured source', acceptance: ['Cite source'], executionPlan: { verification: { command: 'node', args: ['--version'] } } } });
  assert.ok(!bound.isError);
  assert.equal(JSON.parse(bound.content[0].text).executionPlan.dirtyPolicy, 'reject');
  assert.equal(JSON.parse(bound.content[0].text).executionPlan.verification.timeoutMs, 600000);
  const invalid = await client.callTool({ name: 'teams_create', arguments: { objective: 'Modify files', acceptance: ['write'], mode: 'workspace-write' } });
  assert.equal(invalid.isError, true);
  const cancel = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(cancel.content[0].text).status, 'cancelled');
});


test('MCP inventory can connect while another connection owns the runtime; tool calls still respect ownership', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'teams-mcp-inventory-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspace: dir, profiles: { expert: { model: 'not-used-in-this-test' } } }));
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); rmSync(dir, { recursive: true, force: true }); });
  const connect = async () => {
    const client = new Client({ name: 'inventory-tests', version: '0.1.0' });
    clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], stderr: 'pipe' }));
    return client;
  };
  const owner = await connect();
  const task = await owner.callTool({ name: 'teams_create', arguments: { objective: 'Read source', acceptance: ['Cite file'] } });
  assert.ok(!task.isError);
  const inventory = await connect();
  assert.equal((await inventory.listTools()).tools.length, 7);
  const busy = await inventory.callTool({ name: 'teams_status', arguments: {} });
  assert.equal(busy.isError, true);
  assert.match(busy.content[0].text, /Another runtime owns this workspace/);
  await inventory.close();
  const state = await owner.callTool({ name: 'teams_status', arguments: { taskId: JSON.parse(task.content[0].text).id } });
  assert.equal(JSON.parse(state.content[0].text).status, 'pending');
});
