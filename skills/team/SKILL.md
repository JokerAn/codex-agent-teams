---
name: team
description: Coordinate independent work with Codex's native subagents when parallel execution or a separate review will help; keep the main agent responsible for delivery.
---

Use the host's native subagent tools directly. This skill adds no external runtime.

- For a small or tightly coupled task, work directly. Delegate only a useful independent part or a justified independent review; choose the member count from the work, not a fixed team size.
- Before dispatch, briefly name the work you keep and each member's deliverable. Start your own work immediately; avoid repeating the member's exploration.
- Give each member the objective, necessary facts, relevant paths, constraints and an observable completion condition. Do not copy the whole parent conversation by default; include enough context to avoid rediscovery.
- Use the host's available model and effort controls when they serve the task. Follow the user's choices; never silently downgrade. No separate model inventory or confirmation flow is required by this skill.
- Respect the actual filesystem and permissions. Shared checkouts are shared: keep writers on disjoint paths, or serialize their edits. Use an existing isolated-worktree workflow when the task requires it; never call a fresh thread filesystem isolation.
- Use follow-up instructions to resolve a gap with an existing member. Review its actual evidence and relevant changes; run checks proportional to the risk. A member's completion message alone is not proof. Do not require a second reviewer or a fixed report schema for every task.
- Share meaningful findings or blockers, not a fixed polling ritual. When your work is done, use the native wait/notification mechanism available in this host. If asked to stop, stop this task's members through the available native controls and report any unknown exit state.
- Finish with the result, relevant verification and unresolved limits. Do not claim a speed or cost benefit without a comparable measurement.

Do not call Agent Teams MCP tools, create a task database, open a status panel or start a separate App Server merely to use this skill. If native subagents are unavailable, say so and do the work directly when feasible; do not silently switch to an external executor.

If the user explicitly asks for the contract/evidence/controlled-integration workflow, use the separately available `strict-delivery` skill and strict MCP tools. Installing or switching to that package is a separate action. Ordinary delegation remains native.
