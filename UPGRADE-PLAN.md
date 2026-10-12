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
| 委派重 | 工具自描述谎报必填字段 | `z.toJSONSchema` 把所有带默认值的字段塞进 `required`，暴露 9 个必填、实际只卡 3 个 |

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

### P0-B　超时与取消必须区分

- 问题：`runtime.js:96` 用同一个 `controller` 承载任务超时，`:110` deadline 到点 `abort()`，`:173` 只判断 `signal.aborted ? 'cancelled' : 'failed'`。`grep timed_out src/runtime.js` 零命中。**超时和队长主动取消产生完全相同的结果。**
- 后果：`status.js` 的 `nextActions.cancelled` 给的是"确认退出后按需重新规划"——超时场景下根本没有残留进程，用户在找一个不存在的东西。
- 做法：用独立标志位或 `signal.reason` 区分；超时给专门的原因码和 nextAction（如"本轮超出 X 分钟上限，缩小范围后重试"）。
- 验证：新增回归——超时后 `task.status` 与 `cancelled` 不同，且 `nextAction` 不指向"确认退出"。

### P0-C　成员执行期心跳与卡死检测

- 问题：`runtime.js:122` 的 `phase('member')` 到 `:170` 之间没有任何 phase 调用；`markPhase` 还有同值去重（`status.js:24`）。9.5 分钟里用户看到的阶段字符串一动不动。
- 唯一活着的信号是 `task.updatedAt`（被每分钟一次的 tokenUsage 刷新），但 `renderText`/`renderHtml` **都不渲染它**。
- 做法：
  1. 在 `renderText`/`renderHtml` 输出"距上次活动 X 秒"（`updatedAt` 已存在，纯显示层改动）。
  2. 超阈值显示卡住告警。
  3. 明确标注 `updatedAt` **不是**实时心跳。
- 验证：构造一个长跑 stub，断言文本包含"最近记录"且超阈值时出现告警。

### P1-A　`finish()` 返回值被吞掉

- `runtime.js:180` 状态不匹配时 `return false`，两处调用点（`:170`、`:173`）都不检查。
- 后果：`attempt.status` 可能永久停在 `'running'`、`endedAt` 缺失 → `elapsedMs` 退化 null；更糟的是 `memberLaunch` 停在 `'active'`，下次启动被 `store.js:35` 抛错锁死。
- 做法：检查返回值，丢弃时写一条事件（如 `finish-dropped`）。

### P1-B　`progress`/`phase` 的静默丢弃

- `runtime.js:99-110` 的守卫（防止迟到进度覆盖终态）本身必要，但**丢弃完全静默**。
- 具体危害：`app-server.js:272` 在 `finally` 里发的 `onProgress({memberLaunch:'exited'})` 若被守卫丢弃，attempt 永久留下 `memberLaunch: 'active'` → 下次启动锁死。
- 做法：丢弃时记事件。

### P1-C　`cleanupConfirmed` 会永久锁死工作区

- `store.js:64-69`：若在子进程 spawn 完成前崩溃，`check.childPid` 是 undefined → `Boolean(undefined) === false` → `runtime.js:356` 条件永久为真 → 该工作区**所有**后续操作被拒，错误信息却让用户"检查进程组后重启"——根本没有 PID 可查。
- 做法：修正为"无 childPid 即视为已确认退出"。

### P1-D　`maxConcurrency` 实质失效

- `this.verification` 是单值不是 Map（`runtime.js:406`/`:423`）。两个只读任务并行时，只要一个进入验证阶段，另一个的 `verifyWorkspaceRecord` 就抛错。
- 做法：改成按工作区 Map，或明确文档化"配了并发实际串行"。

### P2-A　错误分类太粗

- `preflight.js:20-27` 只有 5 个阶段桶，把"额度不足 / 网络断连 / 模型返回非 JSON / schema 不匹配 / 成员需要交互"全归为 `member_failed`，配同一句"检查成员的原始错误"。
- `runtime.js:130` 已经存了 `validationFailure.resultExcerpt`（前 12000 字符），但 `taskView` 从不暴露。
- 做法：细化分类 + 把 excerpt 纳入 taskView（或按需返回）。

### P2-B　冗余的全树 SHA-256

- 写任务光"全树哈希 + lstat"至少 10 次，integrate 再叠 5 次。9k 文件仓库单次 1.8-2.0 秒。
- 至少 4 次在逻辑上**不可能变化**：
  - `runtime.js:117` —— 构造整个 `GitWorkspace` 跑完 identity 11 项 + 全树哈希，只为取一个 `contentDigest`，前后各有一次 inspect。
  - `workspace.js:213` —— 与 line 202 之间只隔只读的 `captureTree`。
  - `workspace.js:154` 与 `:139` —— 同一个 digest 校验三次。
  - `workspace.js:228` —— 与 `:225` 之间只有 `git apply --check`（不写文件）。
- 做法：删冗余；`fileManifest` 的变更检测可换 `(mtime, size, inode)` 指纹，仅在检出差异时才做字节哈希。**保留集成前那一次全量哈希作为最终门禁。**

### P2-C　降低委派摩擦（多数是一行改动，体验影响最大）

- `complexity` 默认 `'uncertain'`（`contracts.js:29`）→ 改成 `'bounded'`。当前默认值导致队长忘填就**全部走 expert**，用户确认的轻量分工形同虚设。
- `toJSONSchema` 后按 zod 默认值**裁剪 `required`**，让工具自描述不再谎报 9 个必填。
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
第 2 步  跑全量 + coverage，确认回到全绿（174/174，status.js 行覆盖 100%） ✅ 已完成 2026-10-12
──────────────────────────────────────────────────────── 以下为明天的起点 ────
第 3 步  P0-B 超时/取消分离 + 回归                                   ← 下一步从这里开始
第 4 步  P0-C 心跳显示（纯显示层，低风险）
第 5 步  P1-A / P1-B / P1-C 三个静默失败与锁死问题 + 回归
第 6 步  P2-C 降摩擦（一行改动为主）
第 7 步  P2-A 错误分类 + P2-B 砍冗余哈希
第 8 步  P2-D SKILL.md 重写
第 9 步  P3 产物卫生（清 dist、统一 manifest、写 .gitignore 策略）
```

**当前工作树可安全提交或继续**（基线全绿，10 个文件 +98/-18）。第 1~2 步的改动尚未提交，明天开始前建议先决定是否落一个 commit。

### 明天开工提示（第 3 步 P0-B）

- 目标文件：`src/runtime.js:96`、`:110`、`:173`；`src/status.js` 的 `nextActions.cancelled`。
- 核心问题：任务超时与队长主动取消产生**完全相同**的 `task.status = 'cancelled'`。
- 第一步动作：先加一个能复现"超时被伪装成取消"的失败测试，再改实现。

## 六、尚未验证 / 已知边界

- 本轮改动**只跑过离线单测**，没有跑真实 App Server、没有跑 `codex` 真机、没有重装插件缓存。
- `toolFeedback` 与 dist 版是**移植**而非逐字复制（本版额外保留了 src 已有的 `modelConfirmation` 呈现）。未做过真实宿主的端到端目视确认。
- `teams_wait` 上限提到 300 秒后，与 `examples/mcp.config.toml` 里的 `tool_timeout_sec = 45` **冲突**，手工 MCP 用户会撞超时。需同步更新该示例。
- CLI `start`/`run` 仍是阻塞等待（最坏 610 秒且无进度输出），本轮未动。
- 桌面 UI 点击、父聊天唤醒**从未验证过**，不能声称。
- Windows 会在 `app-server.js:15` / `verification.js:47` 安装后才失败，未在安装前声明。
