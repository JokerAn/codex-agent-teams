---
name: team
description: Coordinate independent work with Codex's native subagents when parallel execution or a separate review will help; keep the main agent responsible for delivery.
---

Use the host's native subagent tools directly. This skill adds no external runtime.

## Dispatch

- For a small or tightly coupled task, work directly. Delegate only a useful independent part or a justified independent review; choose the member count from the work, not a fixed team size.
- Before dispatch, briefly name your own independent deliverable and each member's deliverable; reconsider delegation if your only work would be waiting and summarizing. Start your own work immediately; avoid repeating the member's exploration.
- Give each member the objective, necessary facts, relevant paths, constraints and an observable completion condition. Include known runtime paths and verification commands when needed. Where the host supports it, explicitly disable parent-history inheritance through its dispatch parameter; include enough context to avoid rediscovery.
- For cross-member dependencies, agree on the interface name, inputs, outputs, failure semantics, compatibility and owner before dispatch. Include test-double expectations where relevant. The lead coordinates shared interfaces and configuration; notify all active consumers of changes and reconcile their contract versions before integration. Consumers can work against the agreement while implementation is pending; keep dependent verification pending. Independent tasks need no extra contract document.
- Honor explicit user model and effort choices; never silently downgrade. Where supported by the host, use low for clear, independently verifiable tasks; default to high for cross-component work, critical implementation or uncertainty. Reserve max for important uncertainty or gaps unresolved at high, only where supported. Change model or effort through supported host parameters, never by a prompt alone. Separate requested settings, tool-call parameters and actual host receipts; mark unknowns. No separate inventory or confirmation flow is required.
- Assign verification ownership: members normally run checks focused on their changes; a named owner handles integrated full tests and final builds. Broader member checks need a reason, such as cross-module impact. Serialize checks that share output directories, fixed ports or mutable state; independent read-only checks can run in parallel.

## Coordinate writes

- Assign explicit file-write ownership, shared-file owners and a starting state. Declared ownership is a coordination rule, not an enforced permission. Shared checkouts are shared; a fresh thread or disabled history inheritance does not isolate files. Use an existing isolated-worktree workflow when needed.
- At handoff, compare declared scope with actual changed files, including formatter/generated changes. In a shared checkout, use member operation records, relevant before/after file states or host attribution; the whole checkout's git diff cannot identify one member's changes. Keep uncertain attribution explicit.
- Serialize conflicting edits or transfer ownership before another member writes the same file. If an out-of-scope change appears, stop further writes to that path, establish attribution and coordinate repair; do not reset or overwrite someone else's changes to restore a member's scope.
- Use follow-up instructions with the existing member for missing information or small fixes; environment failures do not automatically justify a rerun, and retries must be bounded. On a host capacity rejection, reuse an available member, continue directly or wait for active work; do not repeatedly try new launches or start an external service.

## Verify and hand off

- Members briefly report actual changes, verification and remaining gaps, not long logs or whole source files. Verification evidence includes the command, exit status, actual executed case count when applicable, scope, environment and dependency readiness, plus the relevant code/dependency state before and after the run. For dirty files, HEAD alone is insufficient: use relevant file fingerprints or an equivalent host state identifier. State any limit in detecting concurrent changes.
- Distinguish local checks passed, waiting for dependency/integration verification, and integrated checks passed. If related inputs change during a run, its result cannot represent a stable snapshot; rerun the affected scope once inputs settle. A failure in another member's file still needs dependency/cause evidence and a named recheck owner; file ownership alone does not excuse it.
- The lead reviews relevant changes, scope attribution and actual evidence, then runs risk-proportional integration checks. Reuse results only when relevant code and dependencies are unchanged, the environment is comparable and the checked scope is sufficient. Confirm expected cases actually ran as well as the exit status; use a negative control when execution or coverage is doubtful. Completion alone is not proof; no mandatory second reviewer, mutation test or fixed report schema.

## Review and finish

- When a bounded, higher-risk change warrants independent review, start once the interface or first implementation is inspectable so review can overlap remaining work. Agree on review scope and a stopping condition. Report reproducible important findings with evidence as soon as they are actionable, then finish remaining checks; separate confirmed findings, hypotheses and unverified directions. Do not expand review indefinitely or require a reviewer for every small change.
- Share meaningful findings or blockers, not a fixed polling ritual. When your work is done, use the native wait/notification mechanism available in this host. If asked to stop, stop this task's members through the available native controls and report any unknown exit state.
- Finish with the result, relevant verification and unresolved limits. When a retrospective is requested, reuse available host timestamps, tool calls, usage records and status for a short, source-linked account: member count, dispatch/completion times, identifiable lead waits, verification runs, rework reasons and deliveries. Mark missing data unknown; do not require routine long reports or a new collector.
- Do not sum usage until cumulative/delta semantics and parent/child attribution are established, or infer fees without attributable usage and pricing. Member durations summed together are not time saved; launch acceptance is not confirmation of actual model or effort. Without a comparable baseline, report only observed delivery/quality evidence and leave net speed/cost benefit unmeasured.

Do not call Agent Teams MCP tools, create a task database, open a status panel or start a separate App Server merely to use this skill. If native subagents are unavailable, say so and do the work directly when feasible; do not silently switch to an external executor.

If the user explicitly asks for the contract/evidence/controlled-integration workflow, use the separately available `strict-delivery` skill and strict MCP tools. Installing or switching to that package is a separate action. Ordinary delegation remains native.
