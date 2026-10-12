---
name: team
description: Delegate bounded repository tasks with explicit contracts, isolated edits, real verification, independent expert review and captain approval. Accuracy and completion efficiency first.
---

Read PRINCIPLES.md in this plugin. Use this workflow when delegation advances the authorized objective; do tiny tasks directly and keep urgent blocking decisions local. Never duplicate a member's work or copy the parent conversation.

All seven teams_* tools must be available. If absent, follow README to pack/check or configure MCP. Pack/doctor do not install or infer; changing the user's Codex configuration requires their authorization. One actual runtime owns a workspace; avoid enabling a manual copy and plugin together.

## User-visible feedback

Make plugin participation visible in the user's language. Tool traces alone are not sufficient.

- When invoked, query `teams_status({overview: true, limit: 10})` once and report the responding viewer version/source separately from the recorded runtime version/source. This is observation, not permission to start a task. If the installed tool lacks overview, use its existing status interface and say version/phase details are unavailable; do not assume the source version is installed.
- If you decide no delegation is useful, explicitly state “Agent Teams 已检查；本次由主 Agent 直接处理，未启动成员。” Do not create a task just to show activity.
- After `teams_start` returns, announce “Agent Teams 已启动” with task label, short task ID, chosen model and actual role. Describe which work the main agent keeps and which work is delegated.
- At meaningful changes, show the recorded phase, elapsed time and blockers using overview or existing receipts. For long-running work, include status in the main agent's regular progress updates, without busy polling. Never invent percentage progress, completed stages or unavailable usage.
- At the end, provide a compact result card/table: task, accepted status, elapsed time, model, verification result and evidence entry. Distinguish awaiting_review, awaiting_integration and succeeded. State the plugin's actual contribution; a review task is not implementation.
- For “插件工作了吗 / 查看团队状态”, answer from status overview. Distinguish an available plugin, an owner process that exists, tasks recorded as running, and tasks actually observed progressing. Unknown legacy metadata remains unknown.
- If the user wants a visual view, the CLI can export a local HTML snapshot: `node src/cli.js status --config <config> --html <new.html>`. Generate it only when an artifact is useful. Use a new output filename and link the result. The page is a snapshot with search/expand interactions; regenerating is required for new records. It does not auto-refresh or start agents. `status --human` works beside an active MCP owner.

## Delegation workflow

1. Define objective, original acceptance criteria, necessary context and existing dependencies. Use teams_create. Defaults are expert/read-only. Other models require operator-supplied task-specific evaluation eligibility; never downgrade just for cost.
2. For edits, explicitly set mode=workspace-write, profile=expert, and executionPlan containing dirtyPolicy, allowedPaths and one verification command/args/deadline. Restrict paths to the intended files/directories. Default reject refuses dirty source; snapshot deliberately captures its current contents without changing index/HEAD. Only execute commands covered by the user's authorization. No dependency installation is implicit.
3. Use teams_start on ready tasks. The runtime creates a new worktree per attempt, runs the member, audits scope, runs verification and independently reviews write changes with expert in a fresh read-only thread. Workspace tasks currently run exclusively; ordinary read-only work can use the configured concurrency. Do separate useful work, then bounded teams_wait when necessary; do not busy-poll.
4. awaiting_review is a report, not success. Inspect original evidence, current patch path, verification logs and machineReview. Use teams_review for the exact latest attemptId and EVERY original criterion with concrete evidence. Runtime checks current binding/files/logs too. A failing command/reviewer cannot be rubber-stamped. Passing a read-only task succeeds; passing a write task yields awaiting_integration.
5. Integrate only when applying the patch is within the user's authorized objective. Inspect the concrete patch and call teams_integrate with latest taskId/attemptId. It refuses source drift, applies only this patch without staging/commit/push, then verifies source. Use teams_wait; succeeded now means captain-approved and integrated with passing source verification. Do not introduce extra human approval when session authorization already covers the change.
6. Missing context needs a better contract. Explicit bounded retries require new reason, use expert, preserve old artifacts and capture a new worktree. Never replay stale review/results. integration_failed retains applied source edits; inspect source/logs before planning a repair, never blindly reapply. Cancel waits for managed execution; old live groups block recovery rather than being killed by PID alone.
7. Cancel unneeded tasks. After terminal completion, teams_cancel with cleanup=true and discard=true explicitly removes the latest changed worktree, retaining records/logs and a succeeded task's status. Without discard, changed files are preserved. Old artifacts may be cleaned via CLI after the MCP runtime closes. Do not race a CLI owner against an active MCP owner.
8. Report outcomes, evidence, uncertainty, elapsed time and host usage. Distinguish protocol fixtures, real model execution, command results and captain attestation. Never claim savings or general quality from one smoke.

Worktree sharing is not filesystem virtualization. Host write sandbox limits the worktree; allowedPaths is an audited delivery gate, not per-file syscall permissions. No recursive agents, automatic commit/push, background captain or parent-chat wake guarantee. This workflow adds quality gates, not a per-task user approval ceremony.
