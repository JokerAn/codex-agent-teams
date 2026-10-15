# 0.6.0 源码真实复验与会话续查

日期：2026-10-14，Asia/Shanghai。宿主聊天 ID：`01a138ec-ce9f-74a1-bc14-f1ae7123a181`。
用户请求：“排查项目bug于升级需求 同时记录本轮会话的详细 后续以本次会话为例子同步审查一下插件的局限性和bug”。

本轮接续 [上一份会话审查](SESSION-AUDIT-2026-10-14-0.6.0.md)，不重复计算此前两个失败成员或已修 S1/S2。本次完成源码真实只读请求、独立成员审查、队长复现与验收；确认并修补 S3 增量动作角色错配，同时补齐严格输出 schema 的协议测试缺口。完整合同、13 次源码 MCP 调用回执、原报告、动作元数据、用量和队长逐项验收保存在 [证据记录](SESSION-AUDIT-2026-10-14-FOLLOWUP-EVIDENCE.json)。

## 1. 开工现场与执行方式

- 实际执行和交付目录：`/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`。已核对 pwd、worktree 列表和工作树；开工已有 44 个暂存文件，没有未暂存改动，暂存树 `e6ee32da47d9abc4450c413a53d8e97d4fee657d`。
- 读取项目 PRINCIPLES/ROADMAP/STATUS、RTK.md、用户指定的已安装 team skill 及插件 PRINCIPLES。首次合读输出较长发生截断，随后定向读取当前章节和具体函数恢复必要信息；这是队长读取范围过大的问题。
- 已安装 MCP 的 `teams_models` 发现 12 个模型，configuredModel=`krill/gpt-6.1-sol`、configuredEffort=`high`，selection=null、captainSelectionSupported=true。队长从真实目录显式选择相同 expert/high，仅作用本次 attempt，不保存真人偏好。
- 缓存 `0.6.0/src/contracts.js` 仍缺 required limitations，而主目录源码已修。已安装 `teams_status(overview:true,limit:2)` 于 `2026-10-14T05:40:51.862Z` 返回 total=8、running=0、awaiting=0、succeeded=5、attention=3、runtime=null。两条失败历史的退出已确认，不能归为本轮审查成功。
- 不重复在已知错误缓存上发起请求。用当前源码的 `createMcpServer` 和 `WorkspaceRouter` 建立临时连接，经官方 MCP SDK Client/InMemoryTransport 调用同一套工具，底层使用真实 Codex App Server。该连接实际取得本项目 owner，沿原运行时写任务记录；没有直接编辑 SQLite、重装缓存或改变用户配置。
- 成员只读审查 observation/status，队长保留 schema 测试检查、受控请求、原生模块复现、修补与共享文档。成员运行期间保持源码基线，报告验收和进程退出后才开始修改。
- 临时控制脚本首次 PTY 长输入未形成有效工具调用，关闭后改用临时文件流。真正工具调用从下表 create 开始；没有由输入失败产生额外任务或模型请求。临时连接和文件流进程已结束，临时证据日志保留供排查。

## 2. 合同、时序和实际回执

任务标题：`Incremental status evidence audit`。kind=review，complexity=bounded，mode=read-only，无 executionPlan。

| 字段 | 实际记录 |
| --- | --- |
| taskId | `2d4b1c08-bcc1-4ce2-97a5-995dec144ec2` |
| attemptId | `9690fe91-50f4-4e50-b254-1e8149ef0b23` |
| 模型/强度/来源 | `krill/gpt-6.1-sol / high / captain-explicit` |
| 创建 UTC | `2026-10-14T05:43:02.202Z` |
| 开始 UTC | `2026-10-14T05:43:22.785Z` |
| 报告及退出 UTC | `2026-10-14T05:46:39.211Z` |
| 成员耗时 | 196426 ms，约 196.4 秒 |
| 队长验收 UTC | `2026-10-14T05:48:01.486Z` |
| threadId / turnId | `01a138ef-d02e-7773-a610-b2cb8c6a4bc3` / `01a138ef-d052-76b0-84e9-db44303b3b5f` |
| 退出/终态 | memberLaunch=exited，cleanupConfirmed=true，review(pass) 后 succeeded |

两个验收条件按合同原文保留，成员及队长均使用相同字符串，顺序不变：

1. Check incremental observation and owner/history consistency; cite file:line, trigger, expected/actual and evidence for each finding, or enumerate checked branches when none found.
2. Separate confirmed bugs, unverified hypotheses and design limitations; provide minimal upgrade recommendations and acceptance checks, identifying unrun verification.

| 顺序 | 调用/阶段 | 回执及判断 |
| --- | --- | --- |
| 1 | `teams_create`，expectedWorkspace=主目录 | 等待启动；合同创建不构成执行 |
| 2 | `teams_start`，显式 expert/high | “Agent Teams 已启动”；成员是独立审查角色，选择来源为队长本次指定，尚未验收 |
| 3 | `teams_status(panel:true)`，本连接仅一次 | 返回只读 loopback 页，2 秒刷新，生命周期为 MCP 连接 |
| 4 | 宿主 `open_in_codex`，placement=right | queued；确认打开请求，不确认页面可见 |
| 5 | 首次 `teams_status(incremental:true)` | 成员执行，0.1 秒，下一执行者=执行成员，退出未确认 |
| 6 | 7 次 `teams_wait(timeoutMs:10000)` | 首次 wait 为完整增量快照，随后使用连接游标；46.5/89.8/115.6/139.2/169.9 秒有变化记录，之后一次“没有新记录”，最后进入等待队长复核。具体调用及返回顺序见 JSON |
| 7 | awaiting_review 回执 | “等待队长复核”，196.4 秒，“下一步：主 Agent · 逐项核对证据，再执行队长复核”，退出已确认，limitations=4 |
| 8 | `teams_status(verbose:true)` | 取得报告、8 条动作元数据、原生用量及退出证据；完整报告后才做判断 |
| 9 | 队长原生 ESM 复现及源码检查 | 确认 S3；历史 workspace 反例仍未证实正常触发路径，不提升为 bug |
| 10 | `teams_review(pass)`，两条原 acceptance | “已完成并验收”，196.4 秒，“下一步：无需操作 · 查看结果与验证证据”；这是报告的 captain-attested 验收 |
| 11 | 关闭临时连接 | 释放 owner 和 panel listener；之后修改与验证由队长负责 |

源码 MCP 共 13 次成功调用：create、start、panel、首次 status、7 次 wait（包括终态返回）、verbose status、review。持久证据去掉游标及随机页面访问路径，不保存完整命令/输出或模型思考。临时原始工具回执：`/tmp/teams-source-audit-20261014-receipts.jsonl`。

## 3. 确认缺陷 S3：独立审查增量仍显示写成员动作（P2，已修）

- 修补前位置：`src/observation.js:38` 的 lastAction 始终取 attempt.actions；`src/runtime.js:202` 将独立 reviewer 进度写入 machineReview；完整 `src/status.js:110` 已返回 reviewerActions。
- 触发：workspace-write attempt 已结束写成员，进入 independent_review；machineReview.actions 产生新动作，增量观察得到 changed。
- 预期：当前独立审查动作与完整视图一致，角色可辨识；尚无审查动作时不显示旧写成员活动。
- 实际：phase=independent_review、unchanged=false，却返回 lastAction.id=writer；完整视图的 reviewerActions 正确包含 reviewer。
- 证据分别记录：成员 VM 纯内存复现；队长原生 ESM 导入 TaskObserver/observedTaskView 再次复现，命令 exit 0；新增回归修补前失败，日志 `/tmp/teams-source-audit-s3-before.log`。动作元数据仅证明成员命令状态，不能单独证明发现正确。
- 最小修补：`src/observation.js:35` 在 machineReview 已开始的 attempt 中选择 reviewer journal，新增 `lastActionRole=reviewer/member`；空 reviewer journal 返回 null，完成报告阶段仍保留最近模型角色。没有 reviewer 的普通成员保持原动作来源。MCP 输入和官方 App Server 协议不变，只有 changed 摘要增加本地角色字段。
- 公开返回兼容性核对：[官方 MCP Tools / Tool Result 文档](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 区分 content 中的非结构化内容与 structuredContent。本项目仍通过既有 TextContent 返回序列化 JSON 和文字回执，没有新增 MCP outputSchema 或把本地角色字段当作官方 lifecycle 字段。该文档也明确 MCP structuredContent 与模型严格输出 schema 是不同约束。
- 回归涵盖审查动作尚为空、开始/结束、审查完成到 awaiting_review、重复观察 unchanged、普通成员角色。没有在本轮启动真实 writer/reviewer 写闭环；最终补丁的验收依据是队长回归，成员审查的是修补前源码。

队长最小复现（修补前结果为 writer，修补后应为 reviewer）：

```js
import { TaskObserver } from './src/observation.js';
const task = { id: 'fixture', objective: 'fixture', status: 'running', dependencies: [],
  updatedAt: '2026-10-14T00:00:00Z', attempts: [{ id: 'attempt', status: 'running',
    phase: 'independent_review', actions: { items: [{ id: 'writer' }] },
    machineReview: { status: 'running', actions: { items: [] } } }] };
const snapshot = { target: { root: '/fixture' }, owner: { processAlive: true }, workspaces: [] };
const observer = new TaskObserver();
const first = observer.observe(task, snapshot);
task.attempts[0].machineReview.actions.items.push({ id: 'reviewer' });
console.log(observer.observe(task, snapshot, { afterCursor: first.cursor }).lastAction.id);
```

## 4. 严格 schema 测试缺口及源码真实复验

上一轮 S1/S2 的源码修补已在开工暂存内容中，本轮未重复修改 contracts/status。

- 队长纯内存递归检查生成 schema 每层 object 的 properties 均进入 required，additionalProperties=false；旧存量报告缺 limitations 仍能读取。命令 exit 0。
- 队长使用真实 Node 子进程上的受控 fake App Server 请求，主动移除 required limitations，修补前 fixture 仍返回 turn-test。确认这是协议测试缺口，而非新的生产故障。
- `tests/fixtures/fake-app-server.js:9` 现在递归检查每层 object 的严格约束，在写 fixture 文件前拒绝无效 schema；正常报告显式返回 limitations=[]。`tests/backend.test.js` 新增顶层 limitations 和嵌套 evidence 缺 required 的拒绝回归。旧报告兼容仍由既有 core 测试覆盖。
- 源码连接的真实模型请求成功返回结构化报告，含 limitations；逐项验收后 succeeded。这补齐了 **krill/gpt-6.1-sol/high 上源码 S1 修补的真实只读复验证据**，不代表正式缓存升级、其他模型支持或实际写链路复验。

## 5. 验证、独立审查和队长判断

| 证据类别 | 本轮结果 |
| --- | --- |
| 命令验证 | 定向 `node --test tests/observation.test.js tests/backend.test.js tests/core.test.js tests/mcp-routing.test.js`：80/80，0 fail，5675.813583 ms；日志 `/tmp/teams-source-audit-targeted-20261014.log` |
| 全量回归 | `npm test`：281/281，0 fail/cancelled/skipped，72469.240333 ms，Node v24.21.0/macOS；日志 `/tmp/teams-source-audit-full-20261014.log`。包括受控协议和真实本机 Git/子进程测试，不当作真实模型写任务 |
| 独立成员结果 | 一份真实只读报告，1 个确认 P2、4 项局限，196426 ms；8 条命令元数据，其中 7 条 exit 0、1 条 exit 1。失败命令后另有 exit 0 的检查；没有命令正文，不能完整重放 |
| 队长判定 | 两条原 acceptance 经源码核查和原生 ESM 复现后 pass；S3 交付补丁经队长离线回归通过；历史证据游标假设保留未确认；正式缓存仍受旧 schema 阻塞 |

host 记录累计 totalTokens=494014、inputTokens=485846、cachedInputTokens=417652、outputTokens=8168、reasoningOutputTokens=1713。缓存输入是输入子集；非缓存输入为 68194，不额外把 reasoning 与 output 相加。没有队长同口径用量、价格和对照组，不能从这次成功审查推导节省费用或总交付提速。报告结束到队长 pass 的间隔为 82275 ms，包含取完整报告、独立复现及证据核对，也不是可直接删除的纯等待。

## 6. 插件局限、假设及后续升级验收

| 类型/优先级 | 本轮案例与最小升级方向 | 后续验收 |
| --- | --- | --- |
| 部署交接 P1 | 源码与正式缓存都标 0.6.0，但缓存未包含 S1/S2/S3。来源和 build digest 已可查看，仍需要交付到部署的明确核验 | 准备包含本轮补丁的 0.6.1 候选，逐字节核对 source/skill；授权升级缓存后，核对实际来源/digest，并做一次真实只读复验 |
| 动作归属 P2 | S3 已最小修补；本轮主要是读成员任务，尚未执行真实独立 reviewer 流程 | 用有界 writer/reviewer 合同核对两份 journal 与 changed lastActionRole，再单独验证写入、独立审查、集成和源复验 |
| 测试缺口 P2 | fixture 曾接受会被实际服务拒绝的 schema；本轮已补两层严格约束 | 持续保留“生成严格 / 存量兼容”分离的回归；模拟通过仍需实际服务验证 |
| 错误分类 P2 | 旧失败保留原错误和退出事实，但 member_turn_incomplete 指引较泛 | 依据官方结构化错误字段收窄 schema/configuration 指引，保留原错误，不用供应商文本猜协议、不自动重试 |
| 未确认假设 | 游标只纳入最新 workspace；单改历史 workspace 时完整历史可变而 unchanged。正常路径中是否存在独立更新仍未证实 | 先确认历史证据可变性及合法触发路径；允许独立变化才扩大摘要范围，验收无关 workspace 不触发 changed |
| 观察与宿主边界 | 页面打开 queued；前台 wait 无新记录不代表推进；游标与状态页随连接结束失效 | 分开验收 HTTP、宿主页面可见性及刷新；不承诺原生子 Agent 面板、自动唤醒或后台队长 |
| 记录边界 | actions 只含有限元数据，模型用 VM 替代原生 import；命令 exit 1 只有退出事实 | 合同明确原生导入优先；可重放的复现代码单列为发现证据，经队长检查后运行；不据元数据推断完整命令或模型思考 |
| 效率边界 | 本轮成员真实交付一个新发现，但主流程还需要接线、等待、复现、修补与回归 | 同任务/基线/验收对照，记录队长全流程耗时与用量；本轮不宣称 30% 提速，不开启付费长跑 |

本轮源码和文档直接交付主目录，无跨 worktree 未同步内容。原暂存树保持，新增改动未暂存，HEAD 不变；源码版本仍为 0.6.0，正式缓存未更新，未 commit、push 或发布。接下来优先做候选包与正式缓存的授权交接，实际写闭环、其他模型、远程 CI 和效率对照分别验收。
