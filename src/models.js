import { createInterface } from 'node:readline/promises';
import { modelRolesSchema } from './contracts.js';
import { assertWorkspace } from './workspace.js';

// Bump when the scope/dispatch permissions of saved confirmations change.
export const modelPolicyVersion = 1;

export function validateModelSelection(selection, catalog, target) {
  if (!selection || selection.policyVersion !== modelPolicyVersion || !['mcp-elicitation', 'interactive-terminal'].includes(selection.source)
      || !Number.isFinite(Date.parse(selection.confirmedAt)) || !['runtime-session', 'workspace'].includes(selection.scope)) throw new Error('Model confirmation is missing or outdated; confirm again.');
  assertWorkspace(selection.target, target);
  const roles = modelRolesSchema.parse(selection.profiles);
  acceptedModelRoles({ expert: JSON.stringify(roles.expert), simple: roles.simple ? JSON.stringify(roles.simple) : 'none', confirm: true }, catalog);
  return structuredClone(selection);
}

/** Host model identifiers are choices, not evidence of relative quality/cost. */
export function modelChoices(catalog) {
  const choices = new Map();
  for (const model of catalog.models) {
    for (const effort of model.efforts.length ? model.efforts : [undefined]) {
      const profile = { model: model.model, ...(effort ? { effort } : {}) };
      const value = JSON.stringify(profile);
      choices.set(value, { value, profile, label: `${model.displayName ?? model.model} · ${model.model} · ${effort ?? '默认强度'}` });
    }
  }
  if (!choices.size) throw new Error('Codex returned no selectable models; no inference started.');
  return [...choices.values()];
}

export function modelSelectionForm(catalog, workspace) {
  const choices = modelChoices(catalog), values = choices.map(item => item.value), labels = choices.map(item => item.label);
  return {
    mode: 'form',
    message: `确认团队模型分工，工作区：${workspace}。强模型负责复杂/不确定任务、独立审查和重试；轻量模型仅用于明确简单的任务。可以全部使用强模型。默认勾选记住此工作区分工，明确提交后可在同一工作区重启复用，每次启动仍核对模型及目录。取消勾选则仅本次运行时有效，可通过 teams_models(forget=true) 或 CLI models --forget 撤销。不改变当前聊天的队长模型。`,
    requestedSchema: { type: 'object', properties: {
      expert: { type: 'string', title: '强模型及推理强度', enum: values, enumNames: labels },
      simple: { type: 'string', title: '简单任务模型及推理强度', enum: ['none', ...values], enumNames: ['全部使用强模型', ...labels], default: 'none' },
      confirm: { type: 'boolean', title: '我确认以上分工，允许队长在此范围内派发任务', default: false },
      remember: { type: 'boolean', title: '记住此工作区分工，允许重启后复用（可随时撤销）', default: true },
    }, required: ['expert', 'simple', 'confirm', 'remember'] },
  };
}

export function acceptedModelRoles(content, catalog) {
  if (content?.confirm !== true) throw new Error('User model confirmation is required; no selection changed.');
  const choices = modelChoices(catalog), byValue = new Map(choices.map(item => [item.value, item.profile]));
  const expert = byValue.get(content.expert), simple = content.simple === 'none' ? undefined : byValue.get(content.simple);
  if (!expert || (content.simple !== 'none' && !simple)) throw new Error('Selected model/effort is not in the current Codex catalog; confirm again.');
  return modelRolesSchema.parse({ expert, ...(simple ? { simple } : {}) });
}

/** A terminal confirmation is human input, never inferred from a --yes flag. */
export async function confirmModelsInTerminal(catalog, workspace, { stdin = process.stdin, stderr = process.stderr, signal } = {}) {
  if (!stdin.isTTY || !stderr.isTTY) throw new Error('Model confirmation needs an interactive terminal or teams_models(confirm=true) in a host supporting MCP forms. No inference started.');
  const choices = modelChoices(catalog), input = createInterface({ input: stdin, output: stderr });
  const closed = new AbortController();
  const questionSignal = signal ? AbortSignal.any([signal, closed.signal]) : closed.signal;
  input.once('close', () => closed.abort(new Error('Terminal closed before confirmation')));
  try {
    stderr.write(modelSelectionForm(catalog, workspace).message + '\n');
    choices.forEach((item, i) => stderr.write(`${i + 1}. ${item.label}\n`));
    const pick = async (prompt, allowNone = false) => {
      const answer = (await input.question(prompt, { signal: questionSignal })).trim();
      if (allowNone && answer === '0') return 'none';
      if (!/^[1-9]\d*$/.test(answer) || !choices[Number(answer) - 1]) throw new Error('Invalid model selection; nothing confirmed.');
      return choices[Number(answer) - 1].value;
    };
    const expert = await pick('强模型编号：');
    const simple = await pick('简单任务模型编号（0 = 全部使用强模型）：', true);
    stderr.write(`强模型：${expert}\n简单任务：${simple}\n`);
    const rememberAnswer = (await input.question('记住此工作区分工，允许重启复用？默认 yes（回车），输入 no 仅本次：', { signal: questionSignal })).trim().toLowerCase();
    if (!['', 'yes', 'no'].includes(rememberAnswer)) throw new Error('Invalid remember choice; enter yes or no. Nothing confirmed.');
    const remember = rememberAnswer !== 'no';
    stderr.write(`记住工作区分工：${remember ? '是' : '否，仅本次运行时'}\n`);
    const confirm = (await input.question('确认此分工？输入 yes：', { signal: questionSignal })).trim() === 'yes';
    return { profiles: acceptedModelRoles({ expert, simple, confirm }, catalog), remember };
  } finally { input.close(); }
}
