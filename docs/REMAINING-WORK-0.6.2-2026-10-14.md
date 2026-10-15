# 0.6.2 当前缺陷与后续待办

日期：2026-10-14。审查及交付目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；对象为当前工作树，包括已有暂存改动。此轮检查与记录，不修运行代码。

结论：确认三项 P2（H1/H2/U1）和一项 P3 文档问题，未确认 P0/P1。建议先修中断归属、重连端点与更新回退证据，再补实际宿主和写闭环验收。

后续：用户已授权定点修复，H1/H2/U1 与 review 回执精简已在 0.6.3 源码处理。下文保留发现时证据，修补与实际验收以 [STATUS.md](STATUS.md) 最新条目为准；源码交付不等于正式缓存已更新。

## 当前基线与验证

- 当前官方 MCP 回执确认 viewer/runtime 均为 0.6.2，来源 `/Users/anshunli1/.codex/plugins/cache/codex-agent-teams-local/codex-agent-teams/0.6.2/`。build digest `7c003054d72675adf22c64824af8f43da8b0add9be6ecdc4cbbcd7a61d37f2d3` 与最终候选记录一致，构建时间 `2026-10-14T10:34:03.795Z`。这是安装来源证据，不证明桌面停止按钮验收完成。
- 队长本轮 `npm test`：306/306，0 fail/cancelled/skipped，84523.285167 ms，Node v24.21.0/macOS。日志 `/tmp/teams-current-audit-20261014-tests.log`。离线受控协议与真实本机命令不冒充真实模型写闭环。
- 历史 F1/F2/F3、A1–A4、schema required limitations、增量文字回执和 reviewer 动作归属已有后续修补及回归；不重新列为未修缺陷。

## H1 / P2：旧连接清理可能删除新连接控制端点

位置：`src/host-lifecycle.js:107` 按路径无条件 unlink；`:43` 若此前已 publish 则直接返回。`src/mcp.js:195-196` 先关闭运行时/释放 owner，再关闭 server/lifecycle，因此存在新 owner 已发布而旧 lifecycle 尚未清理的交接窗口。

触发：旧连接释放 owner → 新连接取得 owner 并发布同项目 host-control.json → 旧控制器继续 close。预期旧连接只移除自身端点；实际旧连接删掉新文件，新控制器再次 publish 又因 published 集合而跳过，导致后续 hook 绑定/启动/集成失败。

成员使用当前源码 VM 内存模拟提出发现；队长独立执行当前真实 startHostLifecycle，以临时文件系统和实际 Unix sockets 控制交错顺序，命令 exit 0：

```js
old.publish(scope);
fresh.publish(scope);
await old.close();
fresh.publish(scope);
// host-control.json 仍不存在
```

```json
{"case":"H1","newEndpointMissingAfterOldCloseAndRepublish":true}
```

该复现控制了生命周期交错，没有运行两套真实 MCP 进程争抢 owner，也不代表实际重连必现。临时控制器及目录均已清理。

最小修法/验收：清理核对端点归属；publish 在文件缺失或非自身身份时重新检查并修复；明确 owner 与端点交接次序。新增交错关闭回归，确认旧控制器不能删除新端点，新连接可完成实际 hook 绑定。当前测试只覆盖旧连接完全关闭后再重连。

## H2 / P2：失败的启动请求会转移既有任务的中断归属

位置：`src/host-lifecycle.js:73-77` 仅 active 时拒绝跨轮覆盖，bind 立即替换既有 binding；`src/mcp.js:105-113` 先 claim 再尝试 start；`src/runtime.js:87` 后续才拒绝不合法任务状态。

触发：会话 A 的任务已 awaiting_review，active 为空；B 对同 task 请求 start。hook 绑定先变成 B，但 runtime.start 因任务不是 pending 而拒绝。预期失败操作不改变 A 已生效的归属；实际 A 的 Interrupt 不再选择该任务，B 的 Interrupt 却可取消它，持久化 attempt.host 仍为 A。当前已复现场景是待验收任务归属/取消错误，没有外推成正在执行的任意其他会话成员可被取消。

队长独立执行真实 TaskRuntime、内存 TaskStore、受控无模型 backend 和真实 startHostLifecycle，命令 exit 0。A 正常 start/wait 到 awaiting_review；B bind/claim 后 start 抛错；依次发送两个会话的 Interrupt：

```json
{"case":"H2","startBRejected":true,"stopASelected":0,"afterStopA":"awaiting_review","afterStopB":"cancelled","storedHost":"A"}
```

最小修法：将待用 ticket 与已生效 attempt 归属分开，成功接受 start/integrate 后再提交归属；失败时保留原 binding。验收覆盖重复启动、无效模型和过期 integration attemptId，以及合法的新轮集成/重试，避免只补一种失败路径。当前测试仅检查 active 期间跨轮绑定。

## U1 / P2：失败回退会把同版本不同内容误报为原安装已恢复

位置：`scripts/update.js:61-67` 只保存原安装列表元数据，`:106-113` 重新安装旧来源后仅比较版本号和 enabled，没有比较原安装的 build digest 或内容。

触发：原本地 marketplace 来源内容发生同版本变化，或回退重装得到同版本的错误缓存；新安装失败后进入恢复分支。预期确认旧安装内容恢复，无法确认时报告恢复未完成；实际只要版本号、启用状态、来源描述相同便声称“原 marketplace 与插件安装状态已恢复”。不意味着每次更新都会失败或损坏安装。

队长使用真实 `installPreparedPlugin`、临时最小 marketplace 和注入 CLI 的受控复现（exit 0，fixture 已清理）：

1. 候选版本设为 0.6.2，合法 build digest 为 `b` 重复 64 次；旧安装相同版本，缓存 digest 为 `a` 重复 64 次。
2. 注入 CLI list 返回旧来源、版本、enabled=true 和 installedPath；按真实调用序列执行来源替换及旧插件移除。
3. 新的 plugin add 抛出 `controlled new install failure`。
4. 回退 plugin add 返回旧版本与启用状态，但将缓存 build-info 的 digest 改为 `c` 重复 64 次，模拟旧来源同版本漂移。
5. 捕获当前函数的错误，并比较原/恢复 digest，输出：

```json
{"claimedRestored":true,"sameVersion":true,"digestRestored":false,"error":["controlled new install failure","原 marketplace 与插件安装状态已恢复。"]}
```

证据类型：当前源码控制流 + 实际更新函数的受控 CLI 注入。未改正式安装，未实测官方 CLI 在该故障下返回错误内容的发生概率。确认的是恢复证据不足和误报分支。

最小修法：变更前保存原安装的版本、build digest/必要文件身份，回退后从实际缓存重新核对；旧包缺少 build 信息时明确降低到“元数据已恢复、内容未确认”，不能宣称完整恢复。保留原始故障和恢复故障，不自动删除旧包。

验收：同版本不同 digest 必须报告恢复未完成；正确旧内容通过；版本、启用状态、其他 marketplace 不变；缺少旧 digest 的处理有明确证据边界。

## D1 / P3：交接文档存在当前状态漂移

`docs/STATUS.md` 此前顶部仍写“正式安装未更新”，但本轮 MCP 已确认正式缓存/运行时为 0.6.2。`UPGRADE-PLAN.md:663` 仍说 CLI 无进度输出、`:666` 仍说 Windows 仅安装后失败，实际已有 `src/cli-progress.js` 进度回执和 build/pack 平台预检。该计划包含历史语境，不应据此安排重复开发。

最小处理：本轮在 STATUS 顶部写入最新观察，保留历史事实；后续给升级计划增加清晰的历史章节标识，并用一份当前待办引用验收证据。此项不影响运行时正确性。

## 按顺序推进

| 顺序 | 待办 | 完成依据 |
| --- | --- | --- |
| 1 | 修补本轮确认缺陷 | 各触发场景回归通过，原退出、隔离和交付门禁保持 |
| 2 | 当前版本真实停止验收 | 实际桌面 Interrupt/SessionEnd，成员、reviewer、验证阶段分别停止；匹配 attempt 退出确认，其他会话不受影响，集成后改动保留 |
| 3 | 当前版本真实 writer → reviewer → captain → integrate → 源复验 | 选择一个小任务，独立线程、命令/patch 证据、原 HEAD/index 保持、成功及取消各有回执；旧 0.2.0 实测不能代替最新版本 |
| 4 | Linux/macOS × Node 24.0.0/24.x 远程矩阵 | 现有 CI 矩阵跑当前版本；本轮只证明本机 24.21.0，不沿用旧版本远程通过记录 |
| 5 | 小规模同条件质量/效率对照 | 同任务、基线、验收，对照单强模型、原生子 Agent、插件；记录正确率、严重缺陷、总耗时、返工、人工介入及用量，优先验证收益 |
| 6 | 改善交接效率 | 依据实测瓶颈选择有界发现摘要、状态回执或窄工具白名单；成员目前无继承 MCP，不直接全开放 |
| 7 | 按收益决定有限并行写 | 候选逐项集成，源变化后重验/重审，冲突明确拒绝；不能只删除独占判断 |

真实 UI、其他模型、异常权限和当前版本写闭环属于验收缺口；同项目写独占、未知 launch 拒绝恢复、集成失败保留现场、主动脱离进程组不受守护覆盖属于现有边界。没有把它们直接算作新 bug。暂不建议大重构、新框架、按价格自动降级或自动冲突合并。

## 团队与交付

使用用户指定的 codex-agent-teams:team skill 与 Agent Teams MCP。队长检查 update/status、历史待办并执行回归；一名独立只读成员检查停止/进程链路，krill/gpt-6.1-sol/high，captain-explicit。任务 `5532ba0f-a3e0-459e-a064-aa3cb0038df7`，attempt `b7bbf832-ec18-4fc9-a066-2fc87f36d302`，351.3 秒，cleanupConfirmed=true；报告先 awaiting_review，队长复现 H1/H2 并逐条复核三项原 acceptance 后 review(pass)，终态 succeeded。这是审查报告通过，不是补丁修复通过。

成员内存检查、队长实际函数/受控 fixture 复现、306/306 命令回执与队长判断分别记录。成员首次 heredoc 被只读沙箱拒绝，随后 node -e 检查成功；未把被拒绝命令当验证。状态面板已请求在右侧打开，宿主返回 queued，不声明可见性已验收。成员 host token/usage 不构成主任务同条件费用/效率证明。

交付只新增本报告并更新 STATUS。原暂存树 `91e10ffbec423925a342dc7437bceeb0d3218ff4` 保持；本轮文档未暂存。无跨 worktree 未同步内容，未改运行源码、安装/配置、提交或推送。
