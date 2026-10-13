import { taskView, toolFeedback } from './status.js';

/** Foreground observation only. JSON results stay on stdout; receipts go to stderr. */
export async function waitWithProgress(runtime, taskId, {
  intervalMs = 1000, repeatMs = 30000, write = text => process.stderr.write(text),
} = {}) {
  let previous, lastPrinted = 0;
  const show = task => {
    const view = taskView(task, runtime.workspaceStatus());
    const signature = JSON.stringify([view.attemptId, view.status, view.phase, view.model, view.reviewerSelection, view.stalled]);
    const now = Date.now();
    if (signature !== previous || now - lastPrinted >= repeatMs) {
      write(toolFeedback('teams_status', view) + '\n');
      previous = signature;
      lastPrinted = now;
    }
  };
  let task = runtime.status(taskId);
  show(task);
  // The runtime owns the deadline, cancellation and process-exit gate. Keep observing until its
  // managed attempt exits; a wait timeout is only a snapshot, not completion or a reason to cancel.
  while (runtime.active.has(taskId)) {
    task = await runtime.wait(taskId, intervalMs);
    show(task);
  }
  return task;
}
