# 0.6.0 可靠性与交接升级交付

日期：2026-10-14。实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`；当前工作树升级为 0.6.0，保留原暂存内容。依据 [升级方案](UPGRADE-RELIABILITY-EFFICIENCY-2026-10-14.md)，完成三批工程实现。真实同条件效率评测与正式安装按方案单独处理，未执行。

## 效果与当前证据

| 方案要求 | 当前实现 | 验证证据 |
| --- | --- | --- |
| A1 compact/overview owner 一致 | observedTaskView 共用 owner、历史耗时与下一步规则，观察不获取 owner | tests/mcp.test.js 的官方 SDK orphan 矩阵、tests/status.test.js 的历史/活 owner 回归 |
| A2 同步证据后的 deadline | reviewer 前与成功 finish 前再检查 deadline/取消 | tests/write.test.js 的两次 evidence 窗口时钟注入；已有取消/准备/应用超时回归 |
| A3 review 最终模型约束 | qualified 的 review model/effort 必须匹配 expert，否则启动前拒绝 | tests/models.test.js 的 model/effort/省略 effort 矩阵及原路由/重试测试 |
| A4 双向文件/目录转换 | 旧 Git 文件路径如今为目录或遇 ENOTDIR 按 missing；新增路径继续审计 | tests/workspace.test.js 覆盖双向 staged/unstaged、snapshot/candidate/apply/discard；tests/write.test.js 覆盖完整运行时独立审查、队长复核、集成、源命令复验及用户 staged/unstaged、HEAD/index 保持 |
| B1/B2 交付可直接复核 | skill 和成员/写入/reviewer 指令明确验证职责、复现格式与事实来源，队长统一维护 STATUS | 修改后的 skills/team/SKILL.md、src/policy.js；examples/analysis-result.json 是格式示例，不是实测 |
| B3/B4 报告语义与兼容 | 可选 limitations；all-true + blockers 等矛盾报告给出诊断；满足合同但有局限仍 awaiting_review | tests/core.test.js、attempt.test.js、mcp.test.js、status.test.js；旧格式仍可读取，旧 blocked 不自动翻转；写任务原证据门禁不放松 |
| C1 有界过程观察 | actions.js 白名单保存 lifecycle 元数据，512 字节/项、100 项/64 KiB，敏感载荷省略；早到事件等实际 turnId 绑定 | tests/actions.test.js、backend.test.js 的多字节/容量/敏感载荷/错误 turn/迟到 start/超限竞态回归；原进度 attempt 门禁保持，reviewer 归入 machineReview.actions |
| C2/C3 增量观察 | TaskObserver HMAC 游标绑定项目/任务/attempt/连接，增量 status/wait，无变化不重复任务正文 | observation.test.js、mcp.test.js、mcp-routing.test.js；含错误项目、签名篡改、重连拒绝且不获取 owner；旧调用、CLI 与面板仍可用 |
| C4 组合与实际宿主 | 官方 schema 核对、受控协议回归、真实宿主无推理 smoke、最终候选包 SDK | 下方命令与回执；没有把协议 fixture 称为实际模型写任务 |
| G5 总交付提效 | 新增同条件记录模板，保留主任务/交接/返工/完整用量口径 | examples/evaluation-record.json 和方案第五节；真实评测未运行，未宣称达到交付尾部缩短 30% |

新增两个小模块 actions.js、observation.js，未新增依赖、通用录制系统或后台队长；Node 24+ 原生 ESM 与当前 SDK 保持。动作 completed/exitCode 是观察事实，不授予测试通过、进程退出或 captain 成功。

## 验证结果

- 批次 A 定向：112/112，约 47.3 秒；A 完整回归含动作纯函数初始测试：259/259，约 69.2 秒。日志 `/tmp/teams-upgrade-a-targeted.log`、`/tmp/teams-upgrade-a-full.log`。
- 批次 B 定向：84/84，约 24.3 秒，日志 `/tmp/teams-upgrade-b-targeted.log`。
- C 首轮定向：65/65，约 2.7 秒；首轮组合覆盖率：275/275，约 59.7 秒。这是后续超限修补前的结果，不替代最终记录。
- 最终受影响定向：86/86，约 5.5 秒，日志 `/tmp/teams-upgrade-final-targeted.log`。
- **最终 `npm run test:coverage`：276/276，0 fail/cancelled/skipped，60767.42 ms；源码行 97.60%、分支 90.63%、函数 95.43%。** 日志 `/tmp/teams-upgrade-0.6.0-final-coverage.log`。Node v24.21.0、macOS、Codex CLI 0.162.0-alpha.17.2。
- 官方 SDK 中实测整个无变化 MCP 响应（包括第二块文字回执）为 **716 字节**，满足本轮 1 KiB 工程目标。包侧 SDK 同样为 716 字节；这是回执大小证据，不等于真实交付提速。
- `node scripts/smoke-plugin.js --approval-policy never`：exit 0，实际临时宿主安装、缓存独立运行、八工具、双项目归属/owner/取消门禁与退出均通过；inferenceStarted=false、userConfigChanged=false。日志 `/tmp/teams-upgrade-0.6.0-host-smoke.log`。此后超限修补不涉及无推理发现/路由；最终包另做以下核查。

## 协议依据与有界清理

从本机 `codex app-server generate-json-schema --out /tmp/teams-upgrade-app-server-schema` 导出，核对 v2/ItemStartedNotification.json、ItemCompletedNotification.json 中的 ThreadItem、startedAtMs/completedAtMs、commandExecution/mcpToolCall/dynamicToolCall/fileChange/status/exitCode/durationMs。公开依据：[官方 App Server 文档](https://developers.openai.com/codex/app-server/)。协议字段缺失保持 null，不猜测。缓存于 `/tmp/teams-upgrade-official-app-server.html`，未读取用户 ignored 配置内容。

受控注入 TERM 发送失败，确认继续 KILL、有界退出核查和清理错误保留；另以实际临时子进程注入 PID 持久化失败与 TERM/KILL 发送失败，确认 child 真正存活时 cleanupConfirmed=false、同轮拒绝重派，测试通过原始信号函数清理。纯无 PID 状态也拒绝工作区操作。见 tests/backend.test.js。这些是条件控制流证据，不是实际 OS 故障频率或恶意进程完全隔离证明。

## 独立审查

使用用户指定的 team skill 与 Agent Teams MCP，两个审查按批次先后启动，均为 krill/gpt-6.1-sol/high、captain-explicit；队长同步做协议/测试/候选包核查，没有两位写成员并行修改源。

- A 审查 task `760fb472-643c-49c4-8c00-369e014566e5`，attempt `f0cc7bf9-5858-4599-a1a8-9758d4f17c52`，133.5 秒。无阻塞静态结论；队长核对原两条 acceptance 和真实测试后 review(pass)，succeeded。
- B/C 审查 task `b53ff03a-bb7f-423d-90a9-d0bb54b07e63`，attempt `f16b0baa-3a06-40fe-8ed7-312eda0f97b7`，215.3 秒。发现 turn/start 回包前超限动作可导致 entry undefined。队长补真实受控 App Server fixture，修复前确实 TypeError/exit 1，修复后只入队存在的元数据条目、单独记录截断并保留单项截断标记；最终定向及全量通过。报告因正确识别问题和界定局限经两条原 acceptance 复核为 succeeded，不声称成员复验了修补后源码。

命令通过、成员审查结论、队长判断分别记录。审查报告成功不是真实模型 writer/reviewer 写任务通过；本轮没有重跑后者，也不计算与上一轮不同审查范围的加速比。

## 最终候选包与实际交付

最终候选目录：`/Users/anshunli1/asl/code/github/codex-agent-teams/dist/marketplace-v0.6.0-reliability-efficiency-final-20261014`。

- 候选中的全部源码与 skill 和最终主目录逐字节一致；package、lock、两 manifest 均 0.6.0。
- 真实 doctor：live model/effort 可用，只读线程 sandbox/network/approval 回显正确，无推理；官方 SDK stdio 连接最终包确认八工具、新 afterCursor schema、cursor/wait、716 字节响应、页面 v0.6.0 和连接关闭后 listener 退出。
- 最终回执 `/tmp/teams-upgrade-0.6.0-final-package.json`；早期候选保留，不删除旧 dist。首次包侧验证脚本在关闭 Client 后读取已清空的版本信息导致回执错误；保存版本后重跑成功，未以失败脚本作为最终成功证据。
- 没有安装到正式 Codex 配置；当前会话仍使用 0.5.2 缓存。按 README 的显式重装步骤安装最终候选后，新源码接口才能用于正式聊天。
- 主目录直接交付，无跨 worktree 未同步内容。既有暂存树 `83436b9a88ed75da259384fc14d2c31b1fa991de` 保持；0.6.0 运行代码、测试与本轮文档均未暂存，未 commit/push、发布或修改用户配置。

后续单独安排真实同条件效率评测、正式缓存升级及新真实模型任务验收；远程 Linux/Node 次版本 CI 本轮未跑。同项目并行写继续按原门禁后置，不能用本轮只读/受控证据宣称已经实现。
