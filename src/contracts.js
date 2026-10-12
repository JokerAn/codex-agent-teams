import { z } from 'zod';
import { inspectWorkspaceSchema } from './workspace.js';
import { verificationSchema } from './verification.js';

const text = z.string().trim().min(1);
const kind = z.enum(['lookup', 'analysis', 'review', 'implementation']);
const profile = z.strictObject({ model: text, effort: text.optional() });
export const configSchema = z.strictObject({
  workspace: text,
  codexBin: text.default('codex'),
  maxConcurrency: z.number().int().min(1).max(4).default(2),
  taskTimeoutMs: z.number().int().min(1000).max(3600000).default(600000),
  profiles: z.strictObject({
    expert: profile,
    qualified: profile.extend({
      kinds: z.array(kind).min(1),
      evaluationReference: text,
    }).optional(),
  }),
});

export const taskSchema = z.strictObject({
  objective: text.max(8000),
  kind: kind.default('analysis'),
  complexity: z.enum(['bounded', 'uncertain', 'complex']).default('uncertain'),
  acceptance: z.array(text.max(2000)).min(1).max(20),
  context: z.array(text.max(8000)).max(30).default([]),
  dependencies: z.array(text).max(20).default([]),
  profile: z.enum(['expert', 'qualified']).default('expert'),
  mode: z.enum(['read-only', 'workspace-write']).default('read-only'),
  executionPlan: z.strictObject({ dirtyPolicy: z.enum(['reject', 'snapshot']).default('reject'), verification: verificationSchema, allowedPaths: inspectWorkspaceSchema.shape.allowedPaths }).optional(),
}).superRefine((task, ctx) => {
  if (task.mode === 'workspace-write' && (!task.executionPlan?.allowedPaths?.length || task.profile !== 'expert')) ctx.addIssue({ code: 'custom', message: 'Write tasks require expert, executionPlan.verification and allowedPaths' });
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
