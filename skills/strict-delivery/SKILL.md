---
name: strict-delivery
description: Use when the user explicitly requests the external Agent Teams contract, evidence and controlled integration workflow. Requires the optional strict package and its MCP tools.
---

Use this workflow only after an explicit request for strict delivery. If its MCP tools are unavailable, explain that the optional strict package is required; do not install or switch execution modes implicitly.

Read PRINCIPLES.md in this plugin. The captain — this chat's model — owns objective, split and judgement.

## 1. Delegate, or answer directly

First assess the requested change, dependencies and independent parts. Choose the member count from
testable independent tasks and the available capacity (default 2, max 4), not a fixed team size. Two is a
concurrency limit, not a target member count. Before delegating ordinary exploration, name the independent
deliverable the captain will execute immediately and the member's concrete deliverable. If the captain
would only wait, relay, or repeat the member's exploration, do the work directly. A necessary independent
review may justify one member for quality even without parallel implementation. Read-only work can run concurrently; write tasks remain
exclusive, so do not promise simultaneous writers or modify their source baseline while they run.

Delegate only when all four hold: the work is separable from what the captain is doing and does not block
it; success fits testable acceptance criteria; evidence comes from something other than the member (a command
exit, files, a cited observation); the result changes the outcome enough to justify fresh context,
dispatch and evidence review. Honor the user's requested first answer: keep it with the captain when
delegation would delay it. Zero members for a narrow lookup, one for an independent database branch while
the captain traces the request, and two only for two worthwhile branches plus the captain's own work.
Prepare independent read-only contracts before dispatching them close together; do not repeat their
exploration to fill a waiting gap. Members have shell/source access but inherited MCP servers, plugins,
apps and web search are disabled. Do not delegate work requiring a tool they do not have.

Otherwise do it directly — "Agent Teams 已检查；本次由主 Agent 直接处理，未启动成员。" — and never create a
task to look busy. A status question ("插件工作了吗") is `teams_status({workspace: cwd, overview:true, projection:"summary"})`, nothing
more, and so are a one-step edit, a lookup, an urgent decision and work the captain already has context for.
If dispatch is blocked, name the blocker rather than calling it an optional delegation.

Keep scope narrow and send only the current facts needed by that member. State who owns each verification:
read-only members may use static evidence or pure in-memory checks; temporary Git fixtures and commands
that write files belong to the captain or an explicitly authorized execution task. The captain owns shared
STATUS documentation. Do not turn that global rule into a read-only member's additional deliverable.

For each confirmed finding request file:line, trigger, expected/actual behavior, evidence type and minimal
reproduction steps/code when needed. Distinguish member observations, runtime receipts and captain checks.
Review provided code before running it. A genuine blocker must affect an unsatisfied acceptance criterion
and be explained in that criterion's evidence; completed-report verification boundaries go in optional
limitations. A report with limitations still needs captain review. Never mark unrun code as verified.

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

The packaged plugin includes PreToolUse, Interrupt and SessionEnd hooks. The host must enable and trust
these hooks before member start/integration; missing binding fails closed. They bind work to the actual
host session/turn and stop that work on interruption without stopping other chats. Always include the absolute task target.root as workspace in start/integrate with host lifecycle enabled. Both the hook and tool schema require it; never substitute chat cwd for another project. Never
invent a host id or bypass this gate. A cancellation receipt must confirm exit; otherwise inspect state
and do not redispatch. Stopping a chat with an older plugin does not acquire this behavior retroactively.
After an MCP reconnect, status/models remain read-only and do not recreate an owner/control endpoint.
For a saved task, first call teams_wait({workspace: cwd, taskId, timeoutMs: 0}) to initialize its owner and
publish the endpoint, then bind/start/integrate normally. If old execution is unconfirmed, inspect it
before proceeding; do not create duplicate tasks to bypass recovery.

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

There are eight tools: creation binds via `expectedWorkspace`; start/integrate require explicit workspace in the hooks-enabled routed plugin. The other tools accept optional workspace. In the same
connection, a known taskId routes wait/status/review/cancel without repeating the path;
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

After the first successful start in a project, call `teams_status({workspace: target, panel:true, taskIds: [taskId]})` once.
This returns a read-only live page for the explicitly selected task set, reused within this MCP connection. Include all taskIds assigned in this run; this is not inferred host-session ownership. The page can switch to project history. Without taskIds it is explicitly project cumulative history. If the host exposes
`open_in_codex`, open that returned URL as a browser target with `placement: "right"`. Otherwise use an
available in-app browser panel; if neither exists, share a clickable link and explicitly say no panel was
opened. Never automatically launch an external browser. Report the task title, model/effort and current
phase in chat even when the panel is open. The page refreshes every 2 seconds, retains search/filter/expanded
details, and labels read failures as stale. It is a plugin status page, not a native Codex sub-agent panel;
no model thought stream or automatic captain wakeup is provided. The viewer ends with this MCP connection.
If a cached `teams_status` schema has no `panel` field, explain that the installed plugin needs upgrading;
keep reporting progress in chat rather than passing an unsupported field or promising a live page.

`teams_status({taskId})` and `teams_wait` are compact by default (`verbose:true` for raw attempt fields).
With 0.6.0 schemas, first request `teams_status({taskId,incremental:true})`, then pass its cursor as
`afterCursor` to status/wait. An unchanged receipt means no new record; do not infer progress from time.
Changed receipts are bounded summaries: fetch verbose evidence before verdicts. Cursors are scoped to
the current connection, project, task and attempt; on expiry/mismatch request a full snapshot without
afterCursor. Older schemas keep their existing calls. Do not combine incremental with verbose/overview/panel.
Official item lifecycle metadata may appear under actions/reviewerActions. Missing fields stay unknown,
truncation is explicit, and these observations never establish passing tests or confirmed process exit.
While waiting, explicitly use `teams_wait({taskId, timeoutMs:10000})`, never a single multi-minute wait.
Finish the captain's independent work before waiting. Relay each phase/terminal change promptly and
give a brief observation at least every 30 seconds even if the phase is unchanged: elapsed time, latest
record time and next actor. Say "no new record" when that is all the evidence; do not claim the member is
making progress merely because elapsed time grew. This is foreground reporting, not background polling
after the chat turn ends. A wait timeout does not cancel the member, and `timed_out` is not `cancelled`.
`teams_review` takes the latest `attemptId` and every original criterion and returns a compact receipt;
the full report and review evidence remain available through `teams_status({taskId,verbose:true})`.
After the first incremental snapshot, keep using its cursor for observation rather than repeating full summaries.
`teams_integrate` only in the
authorized objective (it refuses source drift, never commits or pushes); `teams_cancel` takes `cleanup:true`
and `discard:true` only to discard the edits. `integration_failed` keeps the applied source edits — inspect
before any repair.

Worktrees are not filesystem virtualization; `allowedPaths` is a delivery gate, not per-file permissions.
No recursive agents, automatic commit/push or background captain.

## 4. Keep observation and handoff small

Read the latest STATUS entry and necessary functions first; expand historical documents only when they answer a concrete question. Do not concatenate long histories into a truncated response. Prefer overview with projection="summary" for identity/counts, or "catalog" for bounded task rows; use neither with taskId, panel, verbose or incremental observation. taskIds is for panel selection only. Cached tools lacking these parameters retain their existing calls until upgraded.

Continue one task with its cursor; retrieve the complete report once for acceptance, then cite its evidence instead of repeatedly returning it. Keep findings as conclusion, trigger, file:line, reproduction and limitations. The captain owns filesystem-writing verification and shared STATUS. Selected tasks, cumulative project history, installed plugin cache and cached input usage are different concepts. Never delete history or infer speed/cost gains from member count or cache ratio.
