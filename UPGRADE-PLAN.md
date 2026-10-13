# codex-agent-teams 升级方案与进度

日期：2026-10-12（Asia/Shanghai）
依据：本轮对 `src/` 全模块的只读审计（4 个并行模块审计 + 逐条复核），以及用户反馈的两条痛点：

1. **使用感知很低** —— 不知道插件有没有在工作、现在到哪一步。
2. **子任务委派不方便** —— 发起一次委派太重。

本文件记录：已完成什么、没完成什么、每一步怎么验证、以及必须遵守的边界。

---

## 零、先说结论：两条痛点的根因

| 痛点 | 根因 | 证据 |
|---|---|---|
| 感知低 | 回执层存在但**从未进入 `src/`** | `dist/marketplace-ui-v0.4.1-1791804093258/` 里有 `toolFeedback`，`git log --all -S"toolFeedback"` 零命中 |
| 感知低 | 成员执行期**绝对静默** | 真实任务 `fc597599` 的 `phases[]` 只有 3 项，`member` 一档持续 **9 分 54 秒** |
| 感知低 | `start()` 同步阻塞事件循环 | 6000 文件仓库实测阻塞 **4312ms**，期间定时器 tick = 0，MCP 完全无响应 |
| 委派重 | `status`/`wait` 绕过已有的 `taskView` | 同一任务原始 JSON **15,152 字节** vs `taskView` **1,779 字节**（8.5×）；写任务可达 87KB ≈ 24k tokens |
| 委派重 | 30 秒等待上限 vs 600 秒默认任务超时 | 一个 10 分钟任务需要 **20 次** `teams_wait` 往返 |
| 委派重 | ~~工具自描述谎报必填字段~~ **此结论已证伪，见 1.8** | — |

**核心判断：这两件事的代码都已经写好过。** 感知层的完整实现在 `dist/` 的一个未跟踪快照里；`taskView` 已经在 `status.js` 里写好了、也在 `overview` 路径用了，只是 `taskId` 路径绕过了它。所以本轮不是"设计新功能"，而是"把已有的接上"。

---

## 一、已完成（本轮已改动，未提交）

`git diff --stat` 共 7 个文件、+71 / -14。

### 1.1 `src/status.js` —— 接上感知层

- 新增 `modelLabel(selection)`：统一输出 `模型 / 推理强度`，缺失时保持"未知"而不是编造。
- 新增 `actionOwner(status, phase)`：回答"下一步谁动手"——`执行成员` / `独立审查成员` / `运行时` / `主 Agent（核实进度）` / `无需操作`。
- `taskView` 增补字段：`title`（优先用合同 `title`，回退 objective 截断 80 字）、`effort`、`nextActor`、`reviewerSelection`（writer 与 reviewer 模型分开呈现）。
- **新增 `toolFeedback(name, value)`**：人类可读回执层，覆盖 `teams_models` / `teams_start` / `teams_status` / 任意任务 / `teams_integrate` / 兜底。关键文案包括：
  - `Agent Teams 已启动 · <标题> [<id8>]` + `角色：实现成员 · <模型>/<强度>` + `确认范围`
  - `下一步：<nextActor> · <nextAction>`
  - **`成员已提交，尚未验收；主 Agent 核对证据，无需额外等待用户批准。`**
  - 错误路径明确写 `此回执不代表成功`。

### 1.2 `src/mcp.js` —— 双块返回 + 缩短返回

- 导入 `taskView`、`toolFeedback`。
- `tool()` 出口改为**两个 content block**：第 0 块仍是原始 JSON（保持机器可解析），第 1 块是人类可读回执。失败路径同样带第二块说明，且明确"不得假定用户已同意"。
- `teams_status({taskId})` 从 `snapshot.tasks[0]`（原始 JSON）改为 **`taskView(...)`**。
- `teams_wait` 上限 **30000 → 300000**，返回改为 `taskView`。
- `teams_status` 列表分支补 `title`。

### 1.3 `src/contracts.js` —— 加 `title`

- `taskSchema` 新增 `title: text.max(80).optional()`。让队长能给任务一个短标签，而不是让用户读 8000 字的 objective。

### 1.4 `src/runtime.js` —— 回执字段 + 让出事件循环

- `start()` 返回值补齐 `toolFeedback` 需要的字段：`title`、`kind`、`reviewerSelection`（仅写任务）、`confirmationScope`。
- `execute()` 在触碰工作区**之前**加一次 `await new Promise(resolve => setImmediate(resolve))`，附注释说明为什么（worktree 准备是同步的 git fork + 全树哈希）。这是修 `start()` 阻塞事件循环的**最小改动**，不影响任何门禁。

### 1.5 测试

- `tests/helpers.js` 新增 `tick()`（`setImmediate`），注释说明"started attempt 会在一个 tick 后才离开 `pending`"。
- `tests/status.test.js`、`tests/core.test.js` 在依赖同步启动的断言前补 `await tick()`。
- 顺带修掉 `status.test.js` 一个**真实测试 bug**：`complete` 是单次 resolve 的捕获变量，第二次 `run()` 后仍指向上一轮的 resolver。之前靠同步执行侥幸通过。

### 1.6 本轮验证结果（已完成，基线全绿）

```
node --test --experimental-test-coverage --test-coverage-include='src/*.js' tests/*.test.js
ℹ tests 174
ℹ pass 174
ℹ fail 0
src/status.js  | 100.00 | 93.57 | 100.00
all files      |  96.99 | 87.38 |  94.58
```

端到端目视确认（真实 MCP 客户端走 stdio）：

```
---- teams_status({taskId}) 回执 ----
block0 bytes: 1006  (原记录约 15000)
Agent Teams · 等待启动 · 检查测试配置 [e9fc5aca]
合同已创建；尚未启动成员。
下一步：主 Agent · 明确任务合同后启动

---- 失败路径回执 ----
Agent Teams · teams_start 未成功
请主 Agent 核对错误及当前记录后继续；此回执不代表成功。
原因：spawn codex ENOENT
```

`git diff --check` 无空白问题；CLI `status --human` 正常。

### 1.7 第 1 步收口记录（2026-10-12 完成）

**方向决策：采用 A + B 组合。**

- **A**：`taskView` 增补精简 `attempts[]` 数组——保留"逐轮看用了哪个模型"的能力，但不带 `threadId`/`childPid`/`usage`/`candidate`/digest 等机器字段。
- **B**：`teams_status` 与 `teams_wait` 新增 `verbose: true` 逃生阀，确实需要原始记录（查 threadId、完整审查结果）时才用。

**实际修掉的四个问题（比原判断多一个）：**

1. **根因甲 · 同步断言** —— `attempt.test.js:195`、`models.test.js:42`：`start()` 后立刻断言同步状态。加 `await tick()`。这是**应修的测试**，让出事件循环正是本次要达成的行为目标。
2. **根因乙 · `taskView` 丢 attempts** —— `models.test.js:119`、`write.test.js:213`：这两个测试测的是真实的 threadId / 审查模型身份，属排障级断言，改用 `verbose: true`。
3. **额外发现的真实 bug（本轮自引入）** —— `toolFeedback` 原先按 `value.viewer` 判断 `teams_status`，但该分支现在返回 `taskView`（无 `viewer`），于是掉进兜底分支读不存在的 `value.taskId.slice` → `Cannot read properties of undefined`。已改为**按值的实际形状分派**：`taskView` / 原始 task / 列表 / 空列表 四种形态各自处理。
4. **顺带修掉的既有测试 bug** —— `status.test.js` 的 `complete` 是单次 resolve 的捕获变量，第二次 `run()` 后仍指向上一轮的 resolver，重试的 promise 永不 resolve。此前靠同步执行侥幸通过。

**新增回归**：`status.test.js` 增加覆盖六种回执形态的测试，并**显式断言精简 `attempts` 不泄漏** `threadId`/`turnId`/`childPid`/`usage`/`candidate`/`workspaceInputDigest`/`modelConfirmation`/`machineReview`——把设计意图锁进测试，防止以后把原始记录又塞回来。

**当前工作树**：10 个文件改动（+98 / -18），基线全绿，**可以安全继续或提交**。

---

## 二、剩余工作（按优先级）

### ~~P0-A　修掉本轮引入的 4 个测试失败~~ —— 已完成，见 1.7

### 1.8 第 2 轮收口记录（2026-10-13）

**本机验证：176/176 通过，`all files` 行覆盖 97.17%，无失败。**

#### 顺序完成项（在 `src/runtime.js`、`src/status.js`、`src/store.js`）

- **P0-B 超时与取消分离** —— 新增 `timed_out` 任务状态。`runtime.js` 用 `exceedDeadline()` 单点收敛
  （`setTimeout` 与 `live()` 原本各有一次 deadline 判定，标志位只在一处设置会让同步准备阶段的超时
  漏判）。超时给出 `task_deadline_exceeded` 原因码和"无残留进程需确认"的 nextAction；
  队长取消仍为 `cancelled` 并保留"确认退出后重新规划"。`canRetry` 纳入 `timed_out`。
- **P0-C 心跳与卡死检测** —— `taskView` 新增 `staleMs` 与 `stalled`（阈值 3 分钟），
  回执、`renderText`、`renderHtml` 都输出"距上次状态记录 X 秒（**记录时间，不是实时心跳**）"，
  超阈值给出"这不等于失败，也无法据此判断模型在推进"的提示。
- **P1-A/P1-B** —— `finish()` 丢弃时写 `finish-dropped` 事件；`progress`/`phase` 的守卫丢弃
  由静默 `return` 改为写 `progress-dropped`/`phase-dropped` 事件。`finish` 的返回值仍未被两个
  调用点消费，但丢弃现在是可追溯的（原设计意图是"不重放"，保留）。
- **P1-C 工作区永久锁死** —— `store.js` 的 `cleanupConfirmed = Boolean(check.childPid)` 改为
  `!check.childPid || !processAlive(check.childPid, true)`：从未记录到 childPid 的检查没有进程组
  可确认，不再把整个工作区锁死在一个无法执行的指令上。**真实保护没有被削弱**——有存活进程组时
  仍抛错，并新增独立回归测试锁定该行为。

#### 顺带修正的一处既有缺陷

`taskView.nextAction` 原先无条件优先取 `task.failure?.nextAction`，导致**取消路径**也显示
"检查成员的原始错误与退出记录"。已改为终态自身的指引优先（`nextActions[task.status]` 先于
`failure.nextAction`）。

#### 并行车道产出（Workflow，两条落地、一条未完成）

用 Workflow 并行跑了三条互不冲突的车道。**结果必须如实记录：**

| 车道 | 结果 | 复核 |
|---|---|---|
| `lane:skill` | SKILL.md 从 1326 词压到 **602 词（-55%）**，改为三条可执行清单 | **已逐条核对**：`teams_create` 必填、`simple` 门槛、`dependencies` 需 succeeded、并发 2/4、写任务串行、`teams_cancel` 可选参数、活跃执行禁止改分工——全部与代码相符 |
| `lane:hygiene` | `examples/mcp.config.toml` `tool_timeout_sec` 45→330；两个示例补 `title` 说明"仅 CLI"；新增 `examples/README.md`、`scripts/clean-dist.js` | **已实测**：`clean-dist.js` 空跑正确列出 8 个可清理目录（107.5MB），一个都没删；`dist/` 仍为 9 份/144MB |
| `lane:hashing` | **未产生任何改动**（`src/workspace.js` 未被修改） | 车道向主 Agent 报告了 `runtime.js:117` 等冗余点而非直接改，符合指令；**P2-B 仍然开放** |

**两个必须记住的教训：**

1. Workflow 的**验证阶段从未运行**——三条车道的产出没有被它们的 verifier 检查过。上面"复核"一栏
   是主 Agent 事后自己补做的。**不要把车道的自述当作已验证。**
2. 车道执行期间与主 Agent 的改动**并发**，车道内部跑到的测试失败（`models.test.js` 等）反映的是
   主 Agent 当时尚未完成的 P1-C 状态，不是车道自身的问题。并发写同一工作树时，中间态测试结果不
   具有判定力。

#### 一处必须纠正的自有结论（重要）

此前审计结论"`z.toJSONSchema` 把所有带默认值的字段塞进 `required`，工具自描述谎报 9 个必填"
**是错的**。实测证据：

- `z.toJSONSchema(taskSchema, { io: 'output' })` 确实返回 9 个 required；
- 但 **MCP SDK 不走 `z.toJSONSchema`**。它优先用 Standard Schema 接口
  `schema['~standard'].jsonSchema.input(...)`（`node_modules/@modelcontextprotocol/server/dist/src-Cqbh3MYc.mjs:5380`）。
- 真实 SDK 路径返回 `required: ["objective","expectedWorkspace","acceptance"]`，**与实际校验一致**。
- 真实 stdio 客户端 `listTools()` 也确认 `teams_create` 的 required 只有这 3 个。

所以 **P2-C 里的"裁剪 required"一项无需修改，已从计划中移除。**

（附带更正另一条次要结论：`outputSchemaFor` 产出的 `required` 包含 `findings`/`blockers`，
但 `resultSchema` 里这两个字段**确实没有默认值**，所以那也是准确的，不是谎报。）

#### 测试基础设施修复

- `tests/logic`：`models.test.js` 的 fixture 显式设 `taskTimeoutMs: 30000`。原默认 1 秒，
  而 CLI 路径要 spawn 完整 Node 进程 + 假 App Server，`execute()` 新增的让出会吃掉余量——
  这是**真实脆弱性**而非抖动，全量跑两次稳定复现后修正。
- `tests/status.test.js` 的恢复测试补了"无 childPid 视为已确认"与"存活进程组仍拒绝"两条对照。
  构造存活对照需要真实 detached 子进程——`processAlive(pid, true)` 是**进程组**语义，
  普通 PID（如 `process.pid`）不是组长，会返回不存在。

### P0-B　超时与取消必须区分 —— **已完成 2026-10-13**

- 问题：`runtime.js:96` 用同一个 `controller` 承载任务超时，`:110` deadline 到点 `abort()`，`:173` 只判断 `signal.aborted ? 'cancelled' : 'failed'`。`grep timed_out src/runtime.js` 零命中。**超时和队长主动取消产生完全相同的结果。**
- 后果：`status.js` 的 `nextActions.cancelled` 给的是"确认退出后按需重新规划"——超时场景下根本没有残留进程，用户在找一个不存在的东西。
- 做法：用独立标志位或 `signal.reason` 区分；超时给专门的原因码和 nextAction（如"本轮超出 X 分钟上限，缩小范围后重试"）。
- 验证：新增回归——超时后 `task.status` 与 `cancelled` 不同，且 `nextAction` 不指向"确认退出"。

### P0-C　成员执行期心跳与卡死检测 —— **已完成 2026-10-13**

- 问题：`runtime.js:122` 的 `phase('member')` 到 `:170` 之间没有任何 phase 调用；`markPhase` 还有同值去重（`status.js:24`）。9.5 分钟里用户看到的阶段字符串一动不动。
- 唯一活着的信号是 `task.updatedAt`（被每分钟一次的 tokenUsage 刷新），但 `renderText`/`renderHtml` **都不渲染它**。
- 做法：
  1. 在 `renderText`/`renderHtml` 输出"距上次活动 X 秒"（`updatedAt` 已存在，纯显示层改动）。
  2. 超阈值显示卡住告警。
  3. 明确标注 `updatedAt` **不是**实时心跳。
- 验证：构造一个长跑 stub，断言文本包含"最近记录"且超阈值时出现告警。

### P1-A　`finish()` 返回值被吞掉 —— **已完成 2026-10-13**

- `runtime.js:180` 状态不匹配时 `return false`，两处调用点（`:170`、`:173`）都不检查。
- 后果：`attempt.status` 可能永久停在 `'running'`、`endedAt` 缺失 → `elapsedMs` 退化 null；更糟的是 `memberLaunch` 停在 `'active'`，下次启动被 `store.js:35` 抛错锁死。
- 做法：检查返回值，丢弃时写一条事件（如 `finish-dropped`）。

### P1-B　`progress`/`phase` 的静默丢弃 —— **已完成 2026-10-13**

- `runtime.js:99-110` 的守卫（防止迟到进度覆盖终态）本身必要，但**丢弃完全静默**。
- 具体危害：`app-server.js:272` 在 `finally` 里发的 `onProgress({memberLaunch:'exited'})` 若被守卫丢弃，attempt 永久留下 `memberLaunch: 'active'` → 下次启动锁死。
- 做法：丢弃时记事件。

### P1-C　`cleanupConfirmed` 会永久锁死工作区 —— **已完成 2026-10-13**

- `store.js:64-69`：若在子进程 spawn 完成前崩溃，`check.childPid` 是 undefined → `Boolean(undefined) === false` → `runtime.js:356` 条件永久为真 → 该工作区**所有**后续操作被拒，错误信息却让用户"检查进程组后重启"——根本没有 PID 可查。
- 做法：修正为"无 childPid 即视为已确认退出"。

### P1-D　`maxConcurrency` 实质失效 —— **已结案 2026-10-13：文档化，非失效**

- `this.verification` 是单值不是 Map（`runtime.js:406`/`:423`）。两个只读任务并行时，只要一个进入验证阶段，另一个的 `verifyWorkspaceRecord` 就抛错。
- 做法：改成按工作区 Map，或明确文档化"配了并发实际串行"。

### P2-A　错误分类太粗 —— **已完成 2026-10-13**

- `preflight.js:20-27` 只有 5 个阶段桶，把"额度不足 / 网络断连 / 模型返回非 JSON / schema 不匹配 / 成员需要交互"全归为 `member_failed`，配同一句"检查成员的原始错误"。
- `runtime.js:130` 已经存了 `validationFailure.resultExcerpt`（前 12000 字符），但 `taskView` 从不暴露。
- 做法：细化分类 + 把 excerpt 纳入 taskView（或按需返回）。

**实际做法（与计划不同，更好）：** 不靠匹配错误文案分类，而是给抛错点挂**结构化码**。
`app-server.js` 新增 `hostError(code, message)`，8 处宿主/成员错误各带一个稳定码；
`preflight.js` 的 `executionFailure` 先读 `error.hostCode ?? error.cause?.hostCode`，命中就返回专门
的 code + nextAction，否则回落到阶段桶（新增 `preflight` 桶）。抛出与分类的 8 个码用 diff 核对过
**完全一致**，无死代码。同时 `taskView` 暴露 `validationFailure`（message / truncated /
resultExcerpt 截到 2000 字符），回执里也带上一段原始返回。
**文案一字未改**——`backend.test.js` 用正则锁定了这些字符串。

### P2-B　冗余的全树 SHA-256 —— **已完成 2026-10-13（3 处中改 2 处、拒绝 1 处）**

**实测收益（2200 文件合成仓库，n=4）**：`candidate()` 省 **558ms（43%）**、`applyCandidate()` 省
**179ms（15%）**、`prepare()` 省 32ms（3%）。产出字节完全一致（candidate digest 前后相同）。

- **改了 2 处**：
  - `candidate()` 里 captureTree 之后的那次再检查——车道实测证明 `captureTree` 让 worktree
    字节不变（`inspect.contentDigest` 前后都是 `0769aa1a0813ec69`），且下游 `candidateEvidence`
    在 review 前、集成前两处仍会检查，窗口仍被覆盖。
  - `applyCandidate()` 里 `--check` 前后的两次 `source()` 合并为一次，位置**更贴近真正的 apply**
    （窗口严格变窄）。实测证明 `git apply --check` 不改 index/worktree/tree/HEAD。
- **拒绝 1 处（重要）**：`prepare()` 的两处 guard **不是冗余**——它们捕捉**不相交**的交错。
  车道通过注入漂移实测：删掉其一会让 worktree 残留（`worktreeLeft=true`，基线是 `false`），
  且 `tests/workspace.test.js:268/:273` 正是断言这条。**保留是对的。**
- **顺带修的诊断损失**：`--check` 现在包了 try/catch，失败时同时说明"源工作区已变"与"补丁与基线
  不再匹配"两种可能，而不是只抛 git 原文。
- **新增测试**：`tests/workspace.test.js` 加了一个用例，锁住"`captureTree` 不改变 worktree
  digest"这个不变量——删掉的那次检查正是依赖它，若未来有人改动 `captureTree` 让它写文件，
  该测试会红。
- **未做**：`runtime.js:117` 那次"构造整个 GitWorkspace 只为取一个 digest"。车道实测构造器本身仅
  ~30ms（非主导项，真正的开销在后面那次 `inspect()`），收益低于改动风险，**保持原样**。

- 写任务光"全树哈希 + lstat"至少 10 次，integrate 再叠 5 次。9k 文件仓库单次 1.8-2.0 秒。
- 至少 4 次在逻辑上**不可能变化**：
  - `runtime.js:117` —— 构造整个 `GitWorkspace` 跑完 identity 11 项 + 全树哈希，只为取一个 `contentDigest`，前后各有一次 inspect。
  - `workspace.js:213` —— 与 line 202 之间只隔只读的 `captureTree`。
  - `workspace.js:154` 与 `:139` —— 同一个 digest 校验三次。
  - `workspace.js:228` —— 与 `:225` 之间只有 `git apply --check`（不写文件）。
- 做法：删冗余；`fileManifest` 的变更检测可换 `(mtime, size, inode)` 指纹，仅在检出差异时才做字节哈希。**保留集成前那一次全量哈希作为最终门禁。**

### P2-C　降低委派摩擦（多数是一行改动，体验影响最大）

- `complexity` 默认 `'uncertain'`（`contracts.js:29`）→ 改成 `'bounded'`。当前默认值导致队长忘填就**全部走 expert**，用户确认的轻量分工形同虚设。
- ~~`toJSONSchema` 后按 zod 默认值裁剪 `required`~~ —— **无需修改，此前的"谎报 9 个必填"是误判，见 1.8。**
- `strictObject` 对未知键给迁移提示而不是硬拒（`files:['a.js']` 现在整条被拒，且不提示"可能是想写 allowedPaths"）。
- 模型确认从"per-runtime + 默认不 remember"改成"默认记住、可撤销"。
- elicitation 无表单支持时，区分"没声明 elicitation"与"显式不支持 form"（当前 `{}` 与 `undefined` 被同样对待）；并给**可达的**降级路径——现在 `mcp.js:51` 指向 CLI，但 CLI 要求 `isTTY` 且会被 `store.js:31` 的 owner 互斥挡住，**两条路都可能死**。
- `examples/simple-task.json` / `read-only-task.json` 缺 `expectedWorkspace`，喂给 `teams_create` 会被拒——补上或标注"仅 CLI 适用"。

### P2-D　SKILL.md 重写

- 现状：43 行 / 1326 词纯散文，六条输出义务互相牵扯。两处与代码语义不符：
  - `skills/team/SKILL.md:26` 说"可以改，先等执行完"，代码（`mcp.js:53`）是执行中直接拒绝。
  - `:14` 要求区分 viewer/runtime 版本来源，但 runtime 为 null 是常态，没说 null 时怎么讲。
- 需要把 dist 版缺失的那节 `## Entry decision: observation or actual delegation` 补回来（明确禁止"用户要实质工作、队长却悄悄降级成状态查询"）。
- 建议结构：**什么时候建队（可判定规则）/ 最小合同模板 / 必须汇报的三句话**，把散文压到 1/3。

### P3　产物与文档卫生

- `dist/` 有 **9 份** marketplace 副本、共 **144MB**，全叫 `codex-agent-teams-local`；`build.js:52` 撞名加时间戳但不删旧的，升级极易 add 到旧包。
- 根 `plugin.json` 不声明 `skills`/`mcpServers`，只有 `.codex-plugin/plugin.json` 声明，且 `mcpServers` 是打包时才补的（`plugin.js:68`）。
- `mcp.json` 的 `env.PATH` 是完整宿主环境快照（含用户名与一次性 tmp 路径），README 只说"包含工作区路径和模型配置"。
- 版本号停在 0.4.0，但 `dist/` 里有 0.4.1 的包且 STATUS.md 未记录。
- 死代码：`events` 表（每次 `save` 写一行、零读取）、`features.*` 四项（测试零断言）、`qualified` profile（SKILL.md 自称 legacy）。

---

## 三、4 个测试失败的诊断 —— **已全部修复，保留记录供追溯**（见 1.7）

### 根因甲：`setImmediate` 让出（2 个）

改动后 `execute()` 不会在 `start()` 返回时同步跑到 `backend.run()`。以下两处断言假定同步：

1. `tests/attempt.test.js:195` 的 `cwd` 断言
   - stub 里 `run: ({cwd: path}) => { cwd = path; ... }`，测试在 `f.runtime.start(plain.id)` 后立刻 `assert.equal(cwd, f.repo)`。
   - 修法：`start()` 后加 `await tick()`。

2. `tests/models.test.js:42` 的 `release` 断言
   - `release` 在 `run()` 内部赋值；`runtime.start(task.id)` 后立刻 `release()` → `release is not a function`。
   - 修法：`start()` 后加 `await tick()`。**注意该测试有 3 处 `start`**（`:51`、`:59` 等），需逐处确认。

**判断：这是测试对实现细节的耦合，属于应修的测试。** 让出事件循环是本次要达成的行为目标本身。

### 根因乙：`taskView` 丢掉了 `attempts[]`（2 个）

这是**需要先决策的设计取舍**，不是简单改测试：

1. `tests/models.test.js:119` —— `ready.attempts[0].actualModel`
2. `tests/write.test.js:213` —— `ready.attempts[0]`，随后读 `actualModel` / `machineReview.actualModel` / `modelConfirmation.source` / `threadId`

这两个测试通过 `teams_wait` 拿到原始 task 记录再深入断言。而本轮把 `teams_wait`/`teams_status({taskId})` 改成返回 `taskView`，**正是**为了把那 15,152 字节降到 1,779 字节——所以这两个测试会失败是预期的，需要决定语义。

**三个可选方向（建议 A 或 B）：**

- **方向 A（建议）**：`taskView` 增补一个精简的 `attempts` 数组，只带真正有用的 per-attempt 字段（`id` / `status` / `model` / `effort` / `actualModel` / `startedAt` / `endedAt` / `phase`）。体积远小于原始记录，且保留"多轮 attempt 逐轮看"的能力。改测试为读该字段。
- **方向 B（建议，若 A 不够）**：保留 `taskView` 为默认，另加一个显式的 `verbose`/`raw` 逃生阀（如 `teams_status({taskId, verbose:true})`）返回原始记录，供确实需要 `threadId` 这类机器字段的场景。`taskView` 里加一句提示指向它。
- **方向 C**：改测试为用底层 API（`runtime.status()`）做深入断言，MCP 层只断言 `taskView` 字段。最省事，但会让 MCP 层失去对 per-attempt 数据的端到端覆盖。

**建议组合：A + B。** A 覆盖绝大多数真实需求（"第二轮用的哪个模型"），B 给排障留出口。

---

## 四、验证纪律（本项目 AGENTS.md 已规定，必须遵守）

- **在开始验证前先告知用户**："以下是验证环境，可提前查看代码改动了。"
- 准确率和完成效率优先，成本其次；默认强模型，**不做静默降级**。
- 每个子 Agent 的完成必须经复核；**禁止把没有验证的结果标为 succeeded**。
- 正式实现只使用官方 SDK；测试允许受控协议模拟。**不要把模拟测试说成真实模型验证。**
- 不自动安装到用户 Codex 配置、不发布、不进行付费长跑。
- 按风险验证：涉及写操作/集成/进程组的改动要跑真实命令路径，不能只跑单测。
- 结果、已验证内容、未解决边界和下一步**更新到 `docs/STATUS.md`**。

## 五、推荐的执行顺序

```
第 1 步  决策并修掉 4 个测试失败（根因甲改测试、根因乙选 A+B）        ✅ 已完成 2026-10-12，见 1.7
第 2 步  跑全量 + coverage，确认回到全绿                              ✅ 已完成 2026-10-12
第 3 步  P0-B 超时/取消分离 + 回归                                   ✅ 已完成 2026-10-13，见 1.8
第 4 步  P0-C 心跳显示                                               ✅ 已完成 2026-10-13，见 1.8
第 5 步  P1-A / P1-B / P1-C 三个静默失败与锁死问题 + 回归             ✅ 已完成 2026-10-13，见 1.8
第 6 步  P2-D SKILL.md 重写                                          ✅ 已完成 2026-10-13（并行车道，主 Agent 复核）
第 7 步  P3 产物卫生（clean-dist 工具 + 示例修正）                     ✅ 部分完成 2026-10-13；dist 本体未删，见 1.8
──────────────────────────────────────────────────────── 以下为下轮起点 ────
第 8 步  P2-C 降摩擦：complexity 默认值、strictObject 提示、
         确认流程默认记住、elicitation 死路、示例兼容性                  ← 从这里开始（required 裁剪一项已证伪，去掉）
第 9 步  P2-A 错误分类细化 + 暴露 validationFailure.resultExcerpt
第 10 步 P2-B 砍冗余全树哈希（workspace.js 三处 + runtime.js:117）
第 11 步 P1-D maxConcurrency 实质失效（verification 改按工作区 Map）
第 12 步 P3 剩余：清 dist 旧副本、统一两个 manifest、PATH 脱敏
```

**基线状态：176/176 全绿，`all files` 行覆盖 97.17%。**

## 六、尚未验证 / 已知边界

- 本轮改动**只跑过离线单测**，没有跑真实 App Server、没有跑 `codex` 真机、**没有重装插件缓存**。
- `toolFeedback` 与 dist 版是**移植**而非逐字复制。已通过真实 stdio MCP 客户端做过端到端目视确认
  （回执文本、超时/取消区分、卡死检测），但**未在真实 Codex 宿主中确认**。
- ~~`teams_wait` 上限与 `examples/mcp.config.toml` 的 `tool_timeout_sec = 45` 冲突~~
  已在 2026-10-13 由并行车道修正为 330。**该示例本身仍未被真实宿主加载验证。**
- **`dist/` 的 9 份副本（144MB）一个都没删**——只提供了空跑的 `scripts/clean-dist.js`。
  删除用户产物需要显式授权。
- **P2-B（冗余哈希）完全未动**：`hashing` 车道只提交了分析、未改代码，`src/workspace.js` 与
  `HEAD` 一致。这项是本轮收益最大但**风险也最高**的性能改动，必须单独一轮、按"保留集成前最终
  全量哈希"的约束做，并用真实仓库实测前后耗时。
- CLI `start`/`run` 仍是阻塞等待（最坏 610 秒且无进度输出），未动。
- 桌面 UI 点击、父聊天唤醒**从未验证过**，不能声称。
- Windows 会在 `app-server.js:15` / `verification.js:47` 安装后才失败，未在安装前声明。
- **并行车道期间与主 Agent 改动并发**，任何在并发窗口内跑出的失败测试都不具备判定力；
  验证结论一律以最终串行全量为准（见 1.8 教训 2）。
