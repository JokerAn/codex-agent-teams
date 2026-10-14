import { z } from 'zod';
import { inspectWorkspaceSchema } from './workspace.js';
import { verificationSchema } from './verification.js';
import { preflightSchema } from './preflight.js';

const text = z.string().trim().min(1);
const kind = z.enum(['lookup', 'analysis', 'review', 'implementation']);
const profile = z.strictObject({ model: text, effort: text.optional() });
export const modelRolesSchema = z.strictObject({ expert: profile, simple: profile.optional() });
export const configSchema = z.strictObject({
  workspace: text.optional(),
  codexBin: text.default('codex'),
  maxConcurrency: z.number().int().min(1).max(4).default(2),
  taskTimeoutMs: z.number().int().min(1000).max(3600000).default(600000),
  profiles: z.strictObject({
    expert: profile,
    simple: profile.optional(),
    qualified: profile.extend({
      kinds: z.array(kind).min(1),
      evaluationReference: text,
    }).optional(),
  }),
});

// Unknown keys are still rejected: an unrecognized field is either a typo (silently dropped work) or an
// attempt to smuggle parent-chat history into a fresh thread. But a bare "Unrecognized key" tells the
// caller nothing about what to write instead, so the message names the valid top-level fields.
const topLevelFields = ['title', 'objective', 'expectedWorkspace', 'kind', 'complexity', 'acceptance', 'context', 'dependencies', 'profile', 'model', 'effort', 'mode', 'executionPlan'];
export const taskSchema = z.strictObject({
  title: text.max(80).optional(),
  objective: text.max(8000),
  expectedWorkspace: text.optional(),
  kind: kind.default('analysis'),
  complexity: z.enum(['simple', 'bounded', 'uncertain', 'complex']).default('uncertain'),
  acceptance: z.array(text.max(2000)).min(1).max(20),
  context: z.array(text.max(8000)).max(30).default([]),
  dependencies: z.array(text).max(20).default([]),
  profile: z.enum(['auto', 'expert', 'simple', 'qualified']).default('auto'),
  model: text.optional(),
  effort: text.optional(),
  mode: z.enum(['read-only', 'workspace-write']).default('read-only'),
  executionPlan: z.strictObject({
    dirtyPolicy: z.enum(['reject', 'snapshot']).default('reject'),
    verification: verificationSchema,
    preflight: preflightSchema.optional(),
    allowedPaths: inspectWorkspaceSchema.shape.allowedPaths,
  }, { error: issue => {
    if (issue.code !== 'unrecognized_keys') return undefined;
    return `Unknown executionPlan field(s): ${issue.keys.join(', ')}. Accepted executionPlan fields: dirtyPolicy, verification, preflight, allowedPaths. `
      + 'To limit which files a write task may change, use executionPlan.allowedPaths (repository-relative), not executionPlan.files; '
      + 'files required before execution belong in executionPlan.preflight.requiredFiles. Unknown fields are rejected rather than ignored.';
  } }).optional(),
}, { error: issue => {
  if (issue.code !== 'unrecognized_keys') return undefined;
  const known = new Set(topLevelFields);
  const hint = issue.keys.filter(key => !known.has(key));
  return `Unknown field(s): ${hint.join(', ')}. Accepted top-level fields: ${topLevelFields.join(', ')}. `
    + 'To limit which files a write task may change, use executionPlan.allowedPaths (repository-relative); '
    + 'the objective itself belongs in "objective". Unknown fields are rejected rather than ignored.';
} }).superRefine((task, ctx) => {
  if (task.effort && !task.model) ctx.addIssue({ code: 'custom', path: ['model'], message: 'Task effort requires an explicit model.' });
  if (task.mode !== 'workspace-write') return;
  // Report the exact field that is missing instead of one combined sentence naming three at once.
  if (!task.executionPlan?.allowedPaths?.length) {
    ctx.addIssue({ code: 'custom', path: ['executionPlan', 'allowedPaths'], message: 'Write tasks require a non-empty executionPlan.allowedPaths (repository-relative paths or directories the member may change).' });
  }
  if (!task.executionPlan?.verification) {
    ctx.addIssue({ code: 'custom', path: ['executionPlan', 'verification'], message: 'Write tasks require executionPlan.verification (command, args, timeoutMs, maxOutputBytes) so the result can be re-checked.' });
  }
  if (task.profile === 'qualified') {
    ctx.addIssue({ code: 'custom', path: ['profile'], message: 'Write tasks cannot use the legacy qualified profile; use auto, expert or simple.' });
  }
});

const criterion = z.strictObject({
  criterion: text,
  satisfied: z.boolean(),
  evidence: z.string().max(8000),
});
export const resultSchema = z.strictObject({
  summary: text.max(16000),
  criteria: z.array(criterion).min(1).max(20),
  findings: z.array(text.max(8000)).max(40),
  blockers: z.array(text.max(8000)).max(20),
});
export function outputSchemaFor(acceptance) {
  const schema = z.toJSONSchema(resultSchema);
  schema.properties.criteria.items.properties.criterion.enum = [...acceptance];
  schema.properties.criteria.minItems = acceptance.length;
  schema.properties.criteria.maxItems = acceptance.length;
  return schema;
}
export const reviewSchema = z.strictObject({
  taskId: text,
  attemptId: text,
  verdict: z.enum(['pass', 'reject']),
  evidence: z.array(z.strictObject({ criterion: text, evidence: text.max(8000) })).min(1).max(20),
});

export function validateResult(value, task) {
  const result = resultSchema.parse(value);
  if (result.criteria.length !== task.acceptance.length || result.criteria.some((c, i) => c.criterion !== task.acceptance[i])) {
    throw new Error('Result must address every acceptance criterion in the original order.');
  }
  if (result.criteria.some(c => c.satisfied && !c.evidence.trim())) {
    throw new Error('Satisfied criteria require evidence.');
  }
  return result;
}
