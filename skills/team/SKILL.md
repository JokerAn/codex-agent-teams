---
name: team
description: Delegate independent read-only repository tasks to Codex members using explicit contracts and captain review. Accuracy and completion efficiency take precedence over cost.
---

Read PRINCIPLES.md in this plugin for the project's priority order.

Use this workflow only when delegation advances the user's authorized objective. Complete tiny tasks directly. Keep the current blocking decision local unless delegation provides a clear benefit. Never duplicate a member's assigned work.

1. Establish the goal and acceptance criteria. Use teams_create with the necessary facts and constraints only. Do not copy the parent conversation. P0 supports read-only work; do not ask a member to edit code.
2. Use the expert profile by default. The qualified profile is allowed only when operator configuration records task-specific evaluation eligibility. Never choose it merely because it is cheaper.
3. Call teams_start for authorized ready tasks. A maximum of 2 members by default (up to 4 configured) may run. Dependencies must pass captain review first. Do not recursively spawn teams.
4. While members run, advance separate useful work. Use teams_wait when the next step actually depends on their result; never busy-poll. Members do not automatically wake an ended parent chat.
5. Inspect each result and relevant original evidence. Call teams_review with the exact attemptId and a concrete justification for EVERY acceptance criterion. Do not rubber-stamp a report. Passing review is captain attestation, not an independently executed test.
6. Missing context requires a better contract. Model failure may justify an explicit retry with new evidence; retries use expert and are bounded. Cancel unneeded work and wait for managed processes to exit.
7. Report outcomes, evidence, remaining uncertainty, elapsed time and available usage. Never claim money saved without a controlled comparison.

The user's existing authorization is sufficient; this workflow does not impose an extra human approval ceremony. Agent review is a quality gate, not a request for the user to approve every task.
