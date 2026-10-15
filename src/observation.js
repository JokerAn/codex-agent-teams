import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { observedTaskView } from './status.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Session-bound cursors: no owner acquisition, task writes or unbounded cursor cache. */
export class TaskObserver {
  constructor() { this.key = randomBytes(32); }
  sign(body) { return createHmac('sha256', this.key).update(body).digest('base64url'); }
  decode(cursor) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 2048) throw Error();
      const [body, signature, extra] = cursor.split('.');
      const expected = Buffer.from(this.sign(body)), actual = Buffer.from(signature ?? '');
      if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch { throw new Error('Invalid or expired observation cursor; request a full snapshot without afterCursor.'); }
  }
  observe(task, snapshot, { afterCursor } = {}) {
    const workspace = snapshot.workspaces?.find(entry => entry.id === task.attempts.at(-1)?.workspaceId);
    const claim = { w: hash(snapshot.target ?? task.target ?? null), t: task.id, a: task.attempts.at(-1)?.id ?? null,
      v: hash([task, workspace ?? null, snapshot.owner ?? null]) };
    const previous = afterCursor === undefined ? null : this.decode(afterCursor);
    if (previous && ['w', 't', 'a'].some(key => previous[key] !== claim[key])) {
      throw new Error('Observation cursor belongs to another workspace, task or attempt; request a full snapshot without afterCursor.');
    }
    const body = Buffer.from(JSON.stringify(claim)).toString('base64url');
    const cursor = `${body}.${this.sign(body)}`;
    const view = observedTaskView(task, snapshot);
    if (!previous) return { ...view, cursor, unchanged: false };
    const result = { taskId: task.id, attemptId: claim.a, status: task.status, phase: view.phase,
      updatedAt: task.updatedAt, cursor, unchanged: previous.v === claim.v };
    if (!result.unchanged) {
      // Once independent review starts, writer actions are historical evidence.
      // An empty reviewer journal must not fall back to the writer's last action.
      const attempt = task.attempts.at(-1);
      const lastActionRole = attempt?.machineReview ? 'reviewer' : 'member';
      const journal = lastActionRole === 'reviewer' ? attempt.machineReview.actions : attempt?.actions;
      Object.assign(result, { phaseLabel: view.phaseLabel, nextActor: view.nextActor, nextAction: view.nextAction.slice(0, 400),
        elapsedMs: view.elapsedMs, integrationElapsedMs: view.integrationElapsedMs, memberExitConfirmed: view.memberExitConfirmed,
        verification: view.verification?.status ?? null, independentReview: view.independentReview,
        captainReview: view.captainReview, integrationVerification: view.integrationVerification?.status ?? null,
        error: view.error?.slice(0, 400) ?? null, limitationCount: view.limitations.length,
        lastActionRole, lastAction: journal?.items?.at(-1) ?? null });
    }
    return result;
  }
}
