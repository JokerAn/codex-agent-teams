import { createInterface } from 'node:readline';
const mode = process.argv[2] ?? 'normal';
let model;
const emit = frame => process.stdout.write(JSON.stringify(frame) + '\n');
const notify = (method, params) => emit({ method, params });
const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
  const req = JSON.parse(line);
  const reply = result => emit({ id: req.id, result });
  if (mode === 'timeout') return;
  if (req.method === 'initialize') return reply({ userAgent: 'fake-test-server' });
  if (req.method === 'initialized') return;
  if (req.method === 'config/read') return reply({ config: { mcp_servers: { 'inherited-team': { command: 'do-not-run' } } } });
  if (req.method === 'model/list') return reply({ data: [{ model: 'test-model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }], nextCursor: null });
  if (req.method === 'thread/start') {
    if (req.params.sandbox !== 'read-only' || req.params.approvalPolicy !== 'never' || req.params.config['features.multi_agent'] !== false || req.params.config['mcp_servers.inherited-team.enabled'] !== false) {
      return emit({ id: req.id, error: { message: 'Isolation settings missing' } });
    }
    model = req.params.model;
    return reply({ thread: { id: 'thread-test' }, model, sandbox: { type: mode === 'unsafe' ? 'dangerFullAccess' : 'readOnly', networkAccess: false }, approvalPolicy: 'never' });
  }
  if (req.method === 'turn/start') {
    const common = { threadId: 'thread-test', turnId: 'turn-test' };
    if (mode === 'hang') return reply({ turn: { id: 'turn-test' } });
    if (mode === 'approval') {
      reply({ turn: { id: 'turn-test' } });
      return emit({ id: 'server-request', method: 'item/commandExecution/requestApproval', params: common });
    }
    if (mode === 'crash') return process.exit(7);
    if (mode === 'bad-json') return process.stdout.write('not-json\n');
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
    return notify('turn/completed', { threadId: 'thread-test', turn: { id: 'turn-test', status: 'interrupted', items: [] } });
  }
});
