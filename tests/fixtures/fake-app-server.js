import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
const mode = process.argv[2] ?? 'normal';
let model, cwd, writable;
const thread = mode === 'write-runtime' ? `thread-${process.pid}` : 'thread-test';
const emit = frame => process.stdout.write(JSON.stringify(frame) + '\n');
const notify = (method, params) => emit({ method, params });
const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
  const req = JSON.parse(line);
  const reply = result => emit({ id: req.id, result });
  if (mode === 'timeout') return;
  if (req.method === 'initialize') return reply({ userAgent: 'fake-test-server' });
  if (req.method === 'initialized') return;
  if (req.method === 'plugin/read') {
    if (!req.params.marketplacePath || req.params.pluginName !== 'codex-agent-teams') return emit({ id: req.id, error: { message: 'Plugin target missing' } });
    return reply({ plugin: { summary: { name: 'codex-agent-teams', installed: false, enabled: false }, marketplaceName: 'codex-agent-teams-local', skills: [{ name: 'codex-agent-teams:team' }], mcpServers: mode === 'plugin-missing' ? [] : ['codex-agent-teams'] } });
  }
  if (req.method === 'config/read') return reply({ config: { model: 'test-model', model_reasoning_effort: 'high', api_key: 'SECRET_FIXTURE_DO_NOT_EXPOSE', mcp_servers: { 'inherited-team': { command: 'do-not-run' } } } });
  if (req.method === 'model/list' && ['catalog-paged', 'catalog-revokable'].includes(mode)) {
    const model = (name, hidden = false) => ({ model: name, displayName: name + ' label', isDefault: name === 'test-model', hidden, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] });
    const revoked = mode === 'catalog-revokable' && existsSync(join(process.cwd(), 'revoke-model'));
    return reply(req.params.cursor ? { data: revoked ? [] : [model('configured-model')], nextCursor: null } : { data: [model('test-model'), model('hidden-model', true)], nextCursor: 'page-two' });
  }
  if (req.method === 'model/list') return reply({ data: [{ model: 'test-model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }, { model: 'configured-model', isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }], nextCursor: null });
  if (req.method === 'thread/start') {
    if (!['read-only', 'workspace-write'].includes(req.params.sandbox) || req.params.approvalPolicy !== 'never' || req.params.config['features.multi_agent'] !== false || req.params.config['mcp_servers.inherited-team.enabled'] !== false) {
      return emit({ id: req.id, error: { message: 'Isolation settings missing' } });
    }
    cwd = req.params.cwd; writable = req.params.sandbox === 'workspace-write';
    const responseCwd = mode === 'wrong-cwd' ? dirname(cwd) : mode === 'invalid-cwd' ? join(cwd, 'missing-fixture-directory') : mode === 'canonical-cwd' ? realpathSync(cwd) : cwd;
    const location = mode === 'missing-cwd' ? {} : { cwd: responseCwd };
    if (writable) {
      if (req.params.config['sandbox_workspace_write.network_access'] !== false || req.params.config['sandbox_workspace_write.exclude_slash_tmp'] !== true || req.params.config['sandbox_workspace_write.writable_roots'].length) return emit({id:req.id,error:{message:'Unsafe write settings'}});
      model = req.params.model;
      return reply({thread:{id:thread},model,...location,sandbox:{type:'workspaceWrite',writableRoots: mode === 'unsafe-write' ? ['/'] : [],networkAccess:false,excludeSlashTmp:true,excludeTmpdirEnvVar:true},approvalPolicy:'never'});
    }
    model = req.params.model;
    return reply({ thread: { id: thread }, model, ...location, sandbox: { type: mode === 'unsafe' ? 'dangerFullAccess' : 'readOnly', networkAccess: false }, approvalPolicy: 'never' });
  }
  if (req.method === 'turn/start') {
    const common = { threadId: thread, turnId: 'turn-test' };
    if (['wrong-cwd', 'missing-cwd', 'invalid-cwd'].includes(mode)) return emit({ id: req.id, error: { message: 'UNEXPECTED_TURN_START' } });
    if (mode === 'output-flood') {
      process.on('SIGTERM', () => {});
      const chunk = Buffer.alloc(64 * 1024, 'x');
      const pump = () => { while (process.stdout.write(chunk)) {} };
      process.stdout.on('drain', pump);
      pump();
      return;
    }
    if (mode === 'hang') return reply({ turn: { id: 'turn-test' } });
    if (mode === 'approval') {
      reply({ turn: { id: 'turn-test' } });
      return emit({ id: 'server-request', method: 'item/commandExecution/requestApproval', params: common });
    }
    if (mode === 'crash') return process.exit(7);
    if (mode === 'bad-json') return process.stdout.write('not-json\n');
    if (mode === 'write-runtime' && writable) writeFileSync(join(cwd, 'sum.js'), 'export const sum = (a,b) => a+b;\n');
    const packet = JSON.parse(req.params.input[0].text);
    if (req.params.outputSchema.properties.criteria.items.properties.criterion.enum[0] !== packet.acceptance[0]) return emit({ id: req.id, error: { message: 'Per-task acceptance schema missing' } });
    const result = { summary: 'Protocol fixture completed', criteria: packet.acceptance.map(criterion => ({ criterion, satisfied: true, evidence: 'fixture:1' })), findings: [], blockers: [] };
    notify('thread/tokenUsage/updated', { ...common, tokenUsage: { total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } } });
    notify('item/completed', { ...common, item: { type: 'agentMessage', text: JSON.stringify(result), phase: 'final_answer' } });
    // Deliberately complete BEFORE the turn/start response to exercise notification races.
    notify('turn/completed', { ...common, turn: { id: 'turn-test', status: 'completed', items: [] } });
    return reply({ turn: { id: 'turn-test' } });
  }
  if (req.method === 'turn/interrupt') {
    reply({});
    return notify('turn/completed', { threadId: thread, turn: { id: 'turn-test', status: 'interrupted', items: [] } });
  }
});
