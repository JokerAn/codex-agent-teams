import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
  assert.equal(tools.tools.length, 6);
  const created = await client.callTool({ name: 'teams_create', arguments: { objective: 'Inspect test config', acceptance: ['Cite config file'] } });
  assert.ok(!created.isError);
  const task = JSON.parse(created.content[0].text);
  assert.equal(task.profile, 'expert');
  const status = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(status.content[0].text).status, 'pending');
  const invalid = await client.callTool({ name: 'teams_create', arguments: { objective: 'Modify files', acceptance: ['write'], mode: 'workspace-write' } });
  assert.equal(invalid.isError, true);
  const cancel = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(cancel.content[0].text).status, 'cancelled');
});
