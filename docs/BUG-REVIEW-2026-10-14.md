# 缺陷审查与主目录复核（0.5.0 → 0.5.1）

日期：2026-10-14（Asia/Shanghai）。审查 checkout：`/Users/anshunli1/.codex/worktrees/99b6/codex-agent-teams`，HEAD `d0bb4698b70f02c2343b5be62cfb679c18f31ee6`，源码版本 0.5.0。依照 PRINCIPLES.md，以准确率、完成效率、小范围可验证闭环为优先。

本轮确认三项 P2 缺陷，均由队长独立复现；本轮范围内没有确认 P0/P1。现有自动化 234/234 通过，不能覆盖这三项边界。不改业务代码，以下均为待修复项。

## 后续修复结果（2026-10-14）

主目录已最小修复下文 F1/F2/F3，并补针对性回归：准备前取消/超时均不创建工作区，owner 缺失时历史耗时保持未知，PATH 未设置与显式空值分别遵循实际执行规则。定向 48/48、最终全量 243/243 通过；实际交付、日志与未验证边界见 [STATUS.md](STATUS.md) 的“主目录快速修复 F1/F2/F3”。下文保留原始审查与同步时证据，其中“尚未修复”描述对应此前时点。

## 主目录同步与适用性复核（2026-10-14）

用户要求先把结论同步到主目录，后续直接在主目录工作。实际交付位置：`/Users/anshunli1/asl/code/github/codex-agent-teams`，分支 main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`，源码版本 0.5.1。同步前工作树和暂存区均干净。

主目录已包含队长显式派发、可选真人模型确认、逐任务 model/effort；旧 0.5.0 checkout 的能力缺口不再作为当前主目录待办。当前源码的 taskSchema 接受 model/effort，MCP teams_start 明确支持 captain models。没有复制旧版业务源码或覆盖主目录既有 STATUS.md。

在主目录执行下文精简复现，三个边界仍存在：F1 preparations=1、status=cancelled、error=Preparation reached after abort；F2 顶层均 null、历史为 600000/1200000；F3 预检报 verification_executable_missing、真实 git --version status=0。命令退出码 0。此轮主目录验证使用内存 stub、固定时间纯函数与只读命令；上文之外的真实临时 Git/worktree 和完整 234 项回归属于原 0.5.0 审查证据，未冒充主目录的新一轮全量结果。

当前主目录对应位置：F1 `src/runtime.js:157`（取消检查在准备后）；F2 `src/status.js:78` 和 `src/status.js:156`；F3 `src/preflight.js:49`。下方原始发现的其他行号以原 0.5.0 审查基线为准。

本次同步的是审查结论，三项缺陷尚未修复。后续优先直接在主目录修复 F1/F2/F3，再推进真实效率评测与有限并行写。没有改业务代码、暂存、提交、推送或删除任何 worktree。

## 已确认缺陷

### F1：准备开始前已经取消，仍然创建工作区（P2）

- 位置：`src/runtime.js:149`，取消入口 `src/runtime.js:326`。
- 触发：带 executionPlan 的任务 `start()` 后，在同一轮立即 `cancel()`；取消先于 execute 的 setImmediate 恢复。
- 原因：恢复后先调用 prepareWorkspaceRecord 和预检，到后面才调用 live() 检查取消信号。
- 实际：真实临时 Git 仓库中，任务最终为 cancelled、backend 调用数为 0，却留下一个 ready worktree。另一个内存 stub 在准备阶段抛错时，状态仍为 cancelled，error 却变为准备错误，覆盖取消原因。
- 影响：取消无法阻止尚未开始的准备，额外执行同步 Git 操作并产生需清理的工作区；准备失败还会使错误记录与取消原因不一致。未发现取消后启动模型推理。
- 最小修法：setImmediate 返回后、进入准备前调用 live()，保留准备完成后的已有检查。
- 验收：同轮 start/cancel 后准备调用数与模型调用数均为 0，无新 workspace 记录，取消原因保持；排队期间耗尽截止时间时也不进入准备；保留“同步准备耗尽 deadline 后不启动成员”的现有回归。

队长真实 Git 复现输出：

```json
{"case":"F1-real-Git","status":"cancelled","backendCalls":0,"workspaceRecords":1,"workspaceStatus":"ready","worktreeExists":true,"error":"Cancelled by captain"}
```

该发现区别于文档中“执行中的同步 Git 段不能即时中断”：这里取消发生在准备尚未开始时。

### F2：owner 缺失时，历史 attempt 仍累计耗时（P2）

- 位置：`src/status.js:78` 的 attemptSummary、`:92` 的历史生成、`:155` 的 owner 缺失处理。
- 触发：快照保留 running task/attempt，没有 endedAt，owner 为 null 或已不存活。
- 原因：overview 修正任务顶层 elapsedMs，却没有修正已生成的 attempts[].elapsedMs。
- 实际：同一快照在开始后 10 分钟、20 分钟观察，顶层耗时都为 null，历史 attempt 分别为 600000、1200000 ms。
- 影响：同一份状态中同时呈现“耗时未知”和持续增长的执行耗时，妨碍故障判断和后续效率统计。
- 最小修法：把 owner 缺失且没有结束时间时的未知规则同步到历史 attempt。
- 验收：上述两个观察时间的顶层和历史耗时均为 null；已有 endedAt 的真实固定耗时保留，活 owner 的当前 attempt 正常计时。

队长独立纯函数复现输出：

```json
{"case":"F2","values":[{"at":"2026-10-13T00:10:00Z","taskElapsedMs":null,"attemptElapsedMs":600000},{"at":"2026-10-13T00:20:00Z","taskElapsedMs":null,"attemptElapsedMs":1200000}]}
```

### F3：PATH 未设置时，预检误拒绝可执行的系统命令（P2）

- 位置：`src/preflight.js:49`，实际执行对照 `src/verification.js:59`。
- 触发：以绝对路径启动 Node/CLI，环境中没有 PATH；验证使用裸命令 git，执行目录不存在同名文件。
- 原因：预检把未设置 PATH 当成空字符串，只搜索 cwd/git；实际 Node spawn 收到未设置 PATH 的环境，会使用 Unix 默认搜索路径。
- 实际：队长直接调用当前源码的 inspectExecution 和 runVerification，在同一目录、同一缺失 PATH 的环境中，前者报 verification_executable_missing，后者执行 git --version 为 passed、exitCode=0、cleanupConfirmed=true。
- 影响：直接 CLI 等缺失 PATH 的启动环境会在模型运行前误拒绝本可执行的任务。打包 launcher 会补 Node 目录，因此不能将此复现外推为所有插件启动方式均受影响。
- 最小修法：统一预检与执行的命令搜索规则，明确区分 PATH 未设置和 PATH=''；保持缺失程序的提前拒绝。
- 验收：覆盖 PATH 缺失、显式空 PATH、相对 PATH 项、绝对 executable 与不存在命令，对照真实 spawn/runVerification 的启动结果。

队长真实验证命令输出：

```json
{"case":"F3-real-verification","pathPresent":false,"preflightCode":"verification_executable_missing","verificationStatus":"passed","exitCode":0,"cleanupConfirmed":true}
```

## 精简复现

在仓库根目录、安装锁定依赖后执行。此段仅用内存数据库、纯函数和只读 git --version；F1 的真实 Git/worktree 补充证据见上文。

```sh
node --input-type=module <<'JS'
import { TaskStore } from './src/store.js';
import { TaskRuntime } from './src/runtime.js';
import { overview } from './src/status.js';
import { inspectExecution } from './src/preflight.js';
import { spawnSync } from 'node:child_process';

const runtime = new TaskRuntime(new TaskStore(':memory:'), {}, {
  workspace: process.cwd(), maxConcurrency: 2, taskTimeoutMs: 1000,
  profiles: { expert: { model: 'controlled-fixture' } },
});
let preparations = 0;
runtime.prepareWorkspaceRecord = () => {
  preparations++;
  throw Error('Preparation reached after abort');
};
try {
  const task = runtime.create({ objective: 'Cancel fixture', acceptance: ['Skip preparation'],
    executionPlan: { verification: { command: process.execPath } } });
  runtime.start(task.id);
  const result = await runtime.cancel(task.id);
  console.log('F1', { preparations, status: result.status, error: result.error });
} finally { await runtime.close(); }

const snapshot = { tasks: [{ id: 'orphan', objective: 'Crash fixture', status: 'running',
  dependencies: [], updatedAt: '2026-10-13T00:00:00Z',
  attempts: [{ id: 'attempt', status: 'running', startedAt: '2026-10-13T00:00:00Z' }],
}], workspaces: [], owner: null, stateExists: true };
for (const at of ['2026-10-13T00:10:00Z', '2026-10-13T00:20:00Z']) {
  const task = overview(snapshot, { at }).tasks[0];
  console.log('F2', { at, top: task.elapsedMs, history: task.attempts[0].elapsedMs });
}

const savedPath = process.env.PATH;
delete process.env.PATH;
try {
  try { inspectExecution({ verification: { command: 'git' } }, process.cwd()); }
  catch (error) { console.log('F3 preflight', error.detail?.code); }
  const actual = spawnSync('git', ['--version'], { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8' });
  console.log('F3 spawn', { status: actual.status, stdout: actual.stdout.trim() });
} finally {
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
}
JS
```

## 升级顺序

| 顺序 | 交付内容 | 验收依据 |
| --- | --- | --- |
| 1 | 先用小补丁修复 F1/F2/F3 | 各自失败场景转为正确行为，现有 234 项回归保持通过，不扩权限或引依赖 |
| 2 | 版本与交付目录核对（主目录能力差异已解决） | 原 0.5.0 checkout 与已安装 0.5.1 存在差异；本次核对主目录已为 0.5.1，支持 captain-explicit 与逐任务 model/effort。后续直接使用主目录，不将旧版缺口列为当前待办 |
| 3 | 小规模真实任务测量协调开销 | 同基线、同任务、同验收，对照单强模型、原生子 Agent 与插件；记录正确率、严重缺陷、拆分/等待/复核/集成耗时和人工介入。先证明交付收益，再判断并行写的投入 |
| 4 | 若数据支持，再实现有限并行写 | 每 attempt 独立工作区；不相交改动可逐项落地；重叠/源漂移明确拒绝；第二个候选对更新后的源重新验证与审查。保留原 index/HEAD、迟到 attempt、取消/退出和恢复门禁；不能只删除独占判断 |

额外容错候选：`src/app-server.js:121` 的 TERM 发送若抛错，会跳过后续 KILL/退出等待，并缓存拒绝的 stopPromise。可参考 verification 的有界清理方式保留原错误并继续核查；本轮没有证明真实 OS 中 TERM 失败后 KILL 能成功，故列为加固建议，不计入三个确认缺陷。

同项目带 executionPlan 任务独占、源改动导致集成拒绝、未知 launch PID 拒绝恢复、集成失败保留现场、ignored 依赖不纳入指纹，均是现有已记录边界。本轮不将其重新包装为 bug。入口路由的一个初步怀疑已被最小复现证伪，未计入发现。

## 验证与团队回执

- 首轮 npm test 因新 worktree 缺少 zod 等依赖而未进入业务用例；随后 npm ci --ignore-scripts 安装锁定的 14 packages，审计 0 vulnerabilities。未改变依赖声明或 lockfile。
- 队长最终 npm test：234/234，0 fail/cancelled/skipped，61657.67 ms，Node v24.21.0/macOS。日志：`/tmp/codex-teams-review-99b6-tests.log`。
- 队长独立执行三个复现，命令均 exit 0；F1 使用真实临时 Git/worktree，F3 使用真实 runVerification，F2 使用固定时间快照。临时目录和 worktree 已清理。这些证据没有使用真实模型修改或验证项目。
- 使用用户指定的 codex-agent-teams:team skill 与 Agent Teams MCP，两个真实只读成员均为 krill/gpt-6.1-sol/high、captain-explicit。
- 状态审查：task `f39f72f8-ba0c-40fe-9288-db2f861b252b`，attempt `2a13eb99-8fbe-4a05-88b6-0e37e4d5f062`，225.6 秒。报告两项 P2，队长逐条核对原三项 acceptance 并独立复现后 teams_review(pass)，最终 succeeded。此为审查报告验收，不是缺陷修复验收。
- 工作区/进程审查：task `e3d1252f-bac4-4f68-87f3-492afd31d247`，attempt `4dbb6201-0e96-4245-aad6-4fb0d4269d43`，266.4 秒。报告 PATH 缺陷与清理加固建议，但因只读范围未执行写入型验证，在 blockers 中说明限制，运行时终态 blocked；没有将其改标 succeeded。队长补做实际源码与真实命令对照，独立确认 F3；报告中的容错假设仍保留为建议。
- 未运行新一轮远程 CI、真实 writer/reviewer 写任务、桌面点击验收或同条件效率评测。没有发布、安装到正式配置、提交或推送，也未修改业务源码。
