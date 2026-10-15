# 当前项目审查（0.5.2，2026-10-14）

审查及交付目录：`/Users/anshunli1/asl/code/github/codex-agent-teams`。分支 main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`；分析对象为当前工作树，包括用户已有暂存改动，不仅是 HEAD。依照 PRINCIPLES.md，优先准确性、完成效率和最小可验证闭环。本轮只分析和记录，不修业务代码。

结论：本轮确认四项 P2，未确认 P0/P1。建议先做小范围正确性修补，再做进程故障注入和同条件效率评测；目前没有依据进行大规模重构或开放并行写。

## 已确认缺陷

### A1：owner 缺失的单任务状态仍累计耗时，并给出继续等待指引（P2）

- 触发：MCP 重连后，数据库仍有 running/integrating 记录，但 owner 缺失或已退出；查询 `teams_status({workspace, taskId})`，不传 overview。
- 位置：`src/mcp.js:127` 读取包含 owner 的快照，`:131` 直接调用 `taskView(task, snapshot.workspaces)`，没有传递 owner 信息。`src/status.js:78`、`:106`、`:107` 根据运行中状态继续计时；缺失 owner 的修正在 `overview()` 的 `:157` 后，仅覆盖 overview/HTML 入口。
- 实际影响：同一份孤立记录，默认单任务查询显示递增耗时和“等待当前阶段完成”；overview 则显示耗时未知并要求先检查旧进程。可能使队长继续等待已失去 owner 的执行。没有证据表明此显示问题会绕过运行时恢复/重派门禁。
- 与旧报告关系：旧 F2 的 overview 顶层/历史耗时修复仍有效；本项是未覆盖的 MCP 单任务入口，不将旧 overview 问题重新算作新缺陷。
- 最小修复：提取接受完整 snapshot/owner 的统一观察投影，让单任务与 overview 共用 orphan 处理；同时统一 nextActor/nextAction。保持 status 只读，不因此获取 runtime 或恢复任务。
- 验收：通过官方 MCP Client 对同一 owner 缺失、owner 已退出、活 owner、已有 endedAt、integrating 的记录分别查询单任务和 overview；两入口耗时/警示/下一步一致，未知耗时为 null，真实 endedAt 保持固定值，活 owner 正常计时，观察不创建 owner。

队长用官方 `Client` / `InMemoryTransport`，连接当前 `createMcpServer` 并注入同一只读快照，命令 exit 0：

```json
{"args":{"taskId":"orphan"},"elapsedMs":11092507,"attemptElapsedMs":11092507,"nextActor":"执行成员","nextAction":"等待当前阶段完成","warning":null}
{"args":{"taskId":"orphan","overview":true},"elapsedMs":null,"attemptElapsedMs":null,"nextActor":"执行成员","nextAction":"未检测到记录中的 owner 进程；先检查旧成员进程与任务记录，勿重复启动","warning":"存在执行中记录，但未检测到 owner 进程。进度需确认；状态查看不会恢复或重派任务。"}
```

另用固定时钟调用同一 `taskView` / `overview`，命令 exit 0，结果可重复：

```json
{"at":"2026-10-14T00:10:00Z","compact":[600000,600000],"overview":[null,null]}
{"at":"2026-10-14T00:20:00Z","compact":[1200000,1200000],"overview":[null,null]}
```

在项目根目录执行下列只读复现，不需要实际状态库或模型调用：

```sh
node --input-type=module <<'JS'
import { taskView, overview } from './src/status.js';
const task = { id: 'orphan', objective: 'orphan fixture', status: 'running',
  dependencies: [], updatedAt: '2026-10-14T00:00:00Z',
  attempts: [{ id: 'a', status: 'running', phase: 'member',
    startedAt: '2026-10-14T00:00:00Z' }] };
for (const at of ['2026-10-14T00:10:00Z', '2026-10-14T00:20:00Z']) {
  const compact = taskView(task, [], at);
  const full = overview({ tasks: [task], workspaces: [], owner: null,
    stateExists: true }, { at }).tasks[0];
  console.log({ at, compact: compact.elapsedMs, overview: full.elapsedMs });
}
JS
```

### A2：同步证据检查跨过 deadline 后，仍启动 reviewer 或提交复核（P2）

- 位置：`src/runtime.js:191` 的 `candidateEvidence()` 和 packet 准备后，`:199` 调用 reviewer 前没有 `live()`；`:210` 的最终 `candidateEvidence()` 后，`:214` 直接 finish。证据检查包含同步文件读取与整树检查（`src/workspace.js:219`）。
- 触发：写任务的总 deadline 在上述同步检查期间耗尽。事件循环被同步操作占用，超时 timer 尚未执行，之前的 `live()` 已通过。
- 实际影响：第一次检查超时后仍能调用 reviewer backend，可能额外消耗模型调用；最终检查超时后直接进入 awaiting_review，finally 清除 timer，超时没有体现在终态。不是声称同步 Git 应能被即时打断，问题是同步检查结束后缺少绝对 deadline 门禁。
- 最小修复：reviewer 调用前及成功 finish 前补 `live()`，保留取消先发生时的现有归属规则。
- 验收：分别在两次证据检查中推进受控时钟，前者 reviewerCalls=0，后者终态 timed_out；正常写闭环及取消先发生场景保持正确。可增加实际同步耗时测试，但不依赖大仓库或真实模型长跑。

队长直接导入当前 TaskRuntime，使用内存 TaskStore、受控 backend/验证回执，并替换 GitWorkspace 原型的 inspect/candidate/candidateEvidence，证据检查时推进 Date.now；没有改写 runtime 源码。临时 Git 仓库只供构造器身份核查，已清理。总时限 1000 ms，命令 exit 0：

```json
{"slowEvidenceCall":1,"elapsed":1100,"reviewerCalls":1,"reviewerSignalAborted":false,"status":"timed_out","error":"Task deadline exceeded"}
{"slowEvidenceCall":2,"elapsed":1100,"reviewerCalls":1,"reviewerSignalAborted":false,"status":"awaiting_review"}
```

这是运行时分支的受控复现，不是实际模型调用或大仓库性能测量。首次队长 fixture 缺少 baseline，止于 fixture 属性错误；补齐 baseline 后得到上述有效结果，没有修改被测源码。

### A3：legacy qualified 路径可让 review 任务使用非 expert 模型（P2，范围受限）

- 位置：`src/policy.js:16` 至 `:20` 的 qualified 分支只检查 bounded、kinds 和 evaluationReference，没有 review 的 expert 约束；对照 `:4` 的显式模型分支已有约束。配置 schema 仍接受 qualified（`src/contracts.js:18`），运行时最终选择入口为 `src/runtime.js:94`。
- 触发：使用仍受支持的 legacy runtime/config 路径，qualified 与 expert 模型不同，qualified.kinds 包含 review，合同 kind=review、complexity=bounded、profile=qualified，无显式 model。
- 实际影响：审查任务可按非 expert model/effort 执行并被队长验收，与 review 必须匹配 expert 的规则不一致。本项不表示写任务固定的独立 expert reviewer 被绕过；目前公开 expert/simple 显式派发不会携带 qualified 配置。
- 最小修复：对 kind=review 的最终选择统一检查 expert model/effort，不满足时在记录 attempt 和调用 backend 前拒绝，不静默改用其他模型。
- 验收：覆盖 auto/expert/simple/qualified/显式 model/重试，确认所有 review 路径都符合相同约束，非 review 的 legacy qualified 资格逻辑仍有效。

队长直接使用合法 configSchema、当前 TaskRuntime、内存 TaskStore 和受控 backend，复现及 captain pass 命令 exit 0：

```json
{"expert":{"model":"expert-fixture","effort":"high"},"selection":{"model":"qualified-fixture","effort":"low","reason":"controlled evaluation fixture"},"status":"succeeded"}
```

### A4：正常文件／目录转换导致准备、审计及显式 discard 清理失败（P2）

- 位置：`src/workspace.js:84` 只将 ENOENT 视为缺失，ENOTDIR 抛出；`:94` 拒绝普通目录。`source():122` 和 `inspect():178` 合并旧 Git 文件路径，因此旧文件变目录、旧文件的父目录变文件都进入这些分支。`:250` 在 discard=true 时仍先 inspect。
- 触发：基线文件 `entry` 改为 `entry/index.js`；或基线 `entry/index.js` 改为普通文件 `entry`，均为正常 Git 路径转换。
- 实际影响：源中转换会使 dirtyPolicy=snapshot 准备失败；成员转换会使工作区审计失败、无法形成候选；显式 discard 仍失败，需要先恢复路径形态或人工清理。没有发现用户源内容被覆盖或删除。
- 最小修复：把旧 Git 文件路径如今对应普通目录、或普通文件父路径引起的 ENOTDIR 按该 Git 文件已删除处理；新增文件仍进入清单与范围审计。保留父路径 symlink 和特殊文件拒绝，不能简单吞掉所有文件系统错误。
- 验收：双向转换覆盖源 dirty snapshot、成员 staged/unstaged 变更、候选/集成/源复验及 discard；范围外变更和 symlink 仍拒绝，原 HEAD/index/用户内容保持。

成员只完成内存模拟；队长另建两个真实临时 Git 仓库，调用当前 GitWorkspace.prepare/inspect/remove，真实复现六个失败入口，命令 exit 0。以下省略随机临时路径：

| 转换 | inspect | remove(discard=true) | dirty snapshot prepare |
| --- | --- | --- | --- |
| 文件 → 目录 | Unsupported baseline file type: entry | 同左 | 同左 |
| 目录 → 文件 | ENOTDIR，entry/index.js | 同左 | 同左 |

两种成员转换的源 HEAD/index 字节均保持；所有 fixture、worktree/ref 随独立临时仓库清理，无主目录 worktree 增减。本轮没有实现修复，因此没有声称转换候选已成功集成。

## 验证与范围

- 队长 `npm test`：247/247，通过，0 fail/cancelled/skipped，75164.52 ms；Node v24.21.0/macOS。日志 `/tmp/codex-teams-audit-20261014-tests.log`。测试包含受控协议与真实本机命令，不代表真实模型写任务效果。
- 队长独立复现 A1：官方 MCP SDK 双入口对照和固定时钟纯函数对照，均 exit 0；没有写入项目状态或源码。
- 队长独立复现 A2/A3：当前运行时配合内存/受控依赖，命令均 exit 0；A4 使用真实临时 Git/worktree，命令 exit 0。没有新增永久测试或改业务源码。
- package、lock、两 manifest 的版本均为 0.5.2。本轮工具实际来自已安装 0.5.2，能启动成员并返回实时面板；不沿用历史文档中“当前缓存仍旧版”的描述。
- 当前主目录已经修复旧 F1/F2/F3，不重复作为待办。同步 Git 段不能即时中断、未知 launch 身份拒绝恢复、带 executionPlan 独占、集成失败保留现场，均为已记录设计边界。
- 未运行远程平台矩阵、新真实 writer/reviewer 写闭环或质量/效率对照；未更新依赖、安装正式缓存、commit 或 push。

## 升级顺序

1. **先做四项正确性小补丁。** 优先 A2 deadline 门禁与 A4 路径转换/清理，再补 A1 观察入口一致性与 A3 legacy review 路由。分别增加针对触发条件的回归，再跑完整离线套件；不增加权限、框架或依赖。未实现修复，不预定已发布版本。
2. **按故障路径加固进程清理，再验证真实退出门禁。** TERM 抛错后不能跳过后续有界退出核查；另检查启动后 PID 未落盘与清理失败的组合，统一同轮与恢复时的保守判断。这两项仍是未验证加固建议，模拟信号失败只证明控制流，不能证明操作系统实际故障频率。保留原始错误、清理错误和退出未知状态，禁止误报成功或自动重派。
3. **做小规模同条件交付效率对照，随后决定并行写。** 同一任务/基线/验收，对照单强模型、原生子 Agent 和插件，记录准确率、严重缺陷、拆分/等待/复核/集成耗时、返工和人工介入。只有验证收益后，再开放不相交候选逐项集成、对更新后的源重验与重审；不能仅移除独占判断。

依赖升级应由真实宿主兼容问题、SDK 接口变化或已确认漏洞驱动。本轮没有查询在线版本/漏洞公告，不声称现有锁定依赖已过时，也不建议为统一风格引入框架。

## 团队验收与交付

使用用户指定的 codex-agent-teams:team skill 和 Agent Teams MCP；两成员均为实时目录中的 krill/gpt-6.1-sol/high，captain-explicit，仅本 attempt。运行前展示分工，首次启动后请求连接内实时面板并交宿主右侧打开（宿主返回 queued）；没有声称原生子 Agent 面板。

- 状态机审查 task `07fd1257-edc6-448e-957d-b01f1eeda029`，attempt `9186c6a7-5693-4759-bb44-8dbac2ee1478`，400.3 秒，提出 A2/A3。队长核对原三条 acceptance、源码及独立复现后 teams_review(pass)，最终 succeeded；这是审查报告验收，不是修复验收。
- 工作区审查 task `d2f36073-e88f-45e9-8373-ae3eb9c73bfe`，attempt `7cf1aee7-e583-4987-92f8-bdfc69107dec`，391.6 秒，因只读合同不能创建真实 Git fixture，终态 blocked。没有改标 succeeded；队长补做真实 Git 复现后独立确认 A4。
- 命令事实：247/247 离线回归通过，各独立复现 exit 0。成员事实：一份审查通过、一份受阻但有源码/模拟线索。队长判断：四项 P2 已确认，两项清理加固仍待验证，未确认 P0/P1。这三类证据分别记录。
- 主目录新增本报告，并在 STATUS.md 顶部追加本轮结果。既有暂存树指纹 `a5d5e3560f24fb9f81acae29ec49c25340f9638b` 保持；本轮文档未暂存。无跨 worktree 未同步交付，未 commit/push 或重装插件。
