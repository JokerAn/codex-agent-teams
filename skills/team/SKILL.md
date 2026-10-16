---
name: team
description: Coordinate independent work with Codex's native subagents when parallel execution or a separate review will help; keep the main agent responsible for delivery.
---

Use the host's native subagent tools directly. This skill adds no external runtime.

- For a small or tightly coupled task, work directly. Delegate only a useful independent part or a justified independent review; choose the member count from the work, not a fixed team size.
- Before dispatch, briefly name your own independent deliverable and each member's deliverable; reconsider delegation if your only work would be waiting and summarizing. Start your own work immediately; avoid repeating the member's exploration.
- Give each member the objective, necessary facts, relevant paths, constraints and an observable completion condition. Include known runtime paths and verification commands when needed. Where the host supports it, explicitly disable parent-history inheritance through its dispatch parameter; include enough context to avoid rediscovery.
- Honor explicit user model and effort choices; never silently downgrade. Where supported by the host, use low for clear, independently verifiable tasks; default to high for cross-component work, critical implementation or uncertainty. Reserve max for important uncertainty or gaps unresolved at high, only where supported. Change model or effort through supported host parameters, never by a prompt alone. Keep requested settings separate from actual host receipts; mark unknowns and do not claim automatic routing or cost savings. No separate inventory or confirmation flow is required.
- Respect the actual filesystem and permissions. Assign explicit file-write ownership; the lead coordinates shared interfaces and configuration. Shared checkouts are shared: serialize conflicting edits or reassign ownership before writing. Use an existing isolated-worktree workflow when needed; never call a fresh thread filesystem isolation.
- Members hand off changes, evidence and remaining gaps briefly, not long logs or whole source files. Use follow-up instructions with the existing member for missing information or small fixes; environment failures do not automatically justify a rerun, and retries must be bounded. On a host capacity rejection, reuse an available member, continue directly or wait for active work; do not repeatedly try new launches or start an external service.
- Review actual evidence and relevant changes; run risk-proportional checks. For tests, confirm expected cases actually ran as well as the exit status; use a negative control when execution or coverage is doubtful. Completion alone is not proof; no mandatory second reviewer, mutation test or fixed report schema.
- Share meaningful findings or blockers, not a fixed polling ritual. When your work is done, use the native wait/notification mechanism available in this host. If asked to stop, stop this task's members through the available native controls and report any unknown exit state.
- Finish with the result, relevant verification and unresolved limits. Do not claim a speed or cost benefit without a comparable measurement.

Do not call Agent Teams MCP tools, create a task database, open a status panel or start a separate App Server merely to use this skill. If native subagents are unavailable, say so and do the work directly when feasible; do not silently switch to an external executor.

If the user explicitly asks for the contract/evidence/controlled-integration workflow, use the separately available `strict-delivery` skill and strict MCP tools. Installing or switching to that package is a separate action. Ordinary delegation remains native.
