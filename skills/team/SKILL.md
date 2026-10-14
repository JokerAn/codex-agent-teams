---
name: team
description: Delegate bounded repository tasks with explicit contracts, isolated edits, real verification, independent expert review and captain approval. Accuracy and completion efficiency first.
---

Read PRINCIPLES.md in this plugin. The captain — this chat's model — owns objective, split and judgement.

## 1. Delegate, or answer directly

First assess the requested change, dependencies and independent parts. Choose the member count from
testable independent tasks and the available capacity (default 2, max 4), not a fixed team size. Keep an
independent part for the captain when useful. Read-only work can run concurrently; write tasks remain
exclusive, so do not promise simultaneous writers or modify their source baseline while they run.

Delegate only when all four hold: the work is separable from what the captain is doing and does not block
it; success fits testable acceptance criteria; evidence comes from something other than the member (a command
exit, files, a cited observation); the result changes the outcome.

Otherwise do it directly — "Agent Teams 已检查；本次由主 Agent 直接处理，未启动成员。" — and never create a
task to look busy. A status question ("插件工作了吗") is `teams_status({workspace: cwd, overview:true, limit:10})`, nothing
more, and so are a one-step edit, a lookup, an urgent decision and work the captain already has context for.
If dispatch is blocked, name the blocker rather than calling it an optional delegation.

## 2. Minimum viable contract

Derive `cwd` as the absolute intended checkout from this chat's current directory or an explicitly authorized
target. Do not ask the user for a path already known, copy the plugin/cache directory, or claim the host
supplies the chat cwd automatically: the captain passes it from context. A target mismatch means stop.

Call `teams_models({workspace: cwd})` to read live model identifiers and supported efforts. The captain can
choose expert and optional simple roles explicitly and pass `models: {expert: {model, effort}, simple?:
{model, effort}}` to `teams_start`. Human model selection is optional: `confirmationRequired` means there
is no valid human preference, not that explicit captain dispatch is blocked. If a valid preference exists,
reuse it by omitting models; otherwise choose and explain an expert model from the live catalog. Do not
infer model quality from a route name or silently downgrade. The optional `teams_models(confirm:true)`
form belongs to the HOST USER; never fill it in or treat decline as consent. Preferences are project scoped.
Captain choices are recorded per attempt, not persisted as human preferences. Changing human preferences
requires that project's member and verification processes to exit first.

`teams_create` requires `objective`, `acceptance` and `expectedWorkspace`; the captain fills the known path:

```json
{ "objective": "Explain how src/runtime.js distinguishes a deadline overrun from a captain cancellation.",
  "expectedWorkspace": "/abs/path/to/checkout", "kind": "analysis", "complexity": "bounded",
  "acceptance": ["Each branch is cited at file:line.", "The two statuses are contrasted."] }
```

`acceptance` is the contract: the member returns every criterion verbatim, in order, with evidence, and the
captain reviews against those same strings. `kind` defaults to `analysis`; `review` evaluates,
`implementation` edits. `complexity: simple` is only for clearly simple non-review work and is the sole gate
into the selected simple role. Optional task `model`/`effort` explicitly overrides the member choice;
effort requires model, and review tasks must match expert. Retries ignore task overrides and use the expert
role supplied for that retry. Invalid model/effort combinations fail before inference. Write tasks add `mode: "workspace-write"`,
`executionPlan.allowedPaths` and `.verification` (`command`, `args`, `timeoutMs`, `maxOutputBytes`); never
declare files the member must create. `dependencies` must already be `succeeded`. Verified-worktree tasks run
exclusively; read-only work uses concurrency (default 2, max 4).

There are eight tools: creation binds via `expectedWorkspace`; the other seven accept optional `workspace`. In the same
connection, a known `taskId` routes start/wait/status/review/integrate/cancel without repeating the path;
after reconnecting, include `workspace: cwd`. For lists or overviews with multiple projects, always specify
which workspace. State and model preferences belong to each project; owners are not shared across sessions.
A global plugin has no fixed workspace and works across projects without repacking. Legacy configurations
with `workspace` remain fixed to that checkout.

## 3. What to report

Every tool returns raw JSON and then a receipt naming phase, next actor and next action. **Relay the
receipt**, never reconstruct progress from raw fields, and never invent a percentage, stage or usage figure
the record does not carry. The three sentences that matter:

1. **Before starting** — what the captain keeps, what the member delivers, model and effort, and the
   selection source (explicit captain dispatch for this attempt, or a valid human preference and its scope).
2. **When it lands** — phase, elapsed time and next actor, verbatim from the receipt. `awaiting_review` is a
   report, not success; `awaiting_integration` means an approved patch is not applied. Only `succeeded` is
   accepted — for writes, applied and re-verified in the source.
3. **Evidence** — command result, independent review result and captain verdict as three separate facts. A
   review task is not implementation; captain attestation is not machine verification.

`teams_status({taskId})` and `teams_wait` are compact by default (`verbose:true` for raw attempt fields);
`teams_wait`'s timeout (max 300000) expiring does not cancel the member, and `timed_out` is not `cancelled`.
`teams_review` takes the latest `attemptId` and every original criterion; `teams_integrate` only in the
authorized objective (it refuses source drift, never commits or pushes); `teams_cancel` takes `cleanup:true`
and `discard:true` only to discard the edits. `integration_failed` keeps the applied source edits — inspect
before any repair.

Worktrees are not filesystem virtualization; `allowedPaths` is a delivery gate, not per-file permissions.
No recursive agents, automatic commit/push or background captain.
