# codex-agent-teams 升级方案与进度

## 最新复查与下一步（2026-10-15，0.6.3）

以当前工作树复核为准：确认两项尚未修补 P2——跨项目 taskId-only 调用与 hook 的 workspace 解析不一致；更新成功校验遗漏启动器和运行配置。完整复现与验收见 [当前审查](AUDIT-0.6.3-2026-10-15.md)。先小补丁修这两项，再验收真实桌面停止、当前版本写闭环和既有平台矩阵，随后同条件效率测量，按数据决定摘要/工具白名单/并行写。源码和实际viewer/runtime均已0.6.3；下方旧版本状态与“下一步”为历史，不据此重复安排已实现功能。本轮312/312回归通过，但未修这两个新边界。

## 0.6.0 工程实现已交付（2026-10-14）

按本轮可靠性与交付效率方案完成 A/B/C：四项正确性、报告局限与矛盾诊断、有界官方动作观察、连接内增量游标及清理加固。最终276/276覆盖率回归、两次限定独立复核、无推理宿主/最终候选包验证通过，详细要求映射见 [交付记录](UPGRADE-0.6.0-RESULT.md) 和 STATUS 最新条目。运行代码直接交付主目录、本轮未暂存，保留原 index；源码0.6.0不等于正式0.5.2缓存已更新。真实同条件效率/30%目标、正式安装与新真实模型写任务仍为单独步骤，未执行；旧方案状态保留为历史。

## 当前拟实施方案（2026-10-14，0.5.2 审查后）

依据本轮四项缺陷和主子任务效率复盘，新的 [可靠性与交付效率升级方案](UPGRADE-RELIABILITY-EFFICIENCY-2026-10-14.md) 按“效果与验收 → 四项正确性修补 → 报告/验收语义 → 有界过程记录与增量观察 → 同条件效率验证”推进。当前为方案，尚未改运行代码或升级版本；本节与 docs/STATUS.md 最新记录优先于下方历史诊断，旧已完成能力不重复实施。同项目并行写后置，下一步先实施批次 A。

## 0.5.1 模型确认启动修复（2026-10-13）

用户授权有问题则修复，完成后仅暂存、不提交远程。已实现队长启动时显式模型分工、合同 model/effort、可选真人偏好，表单等待/取消不新建 owner；选择按 attempt 记录，角色不在并发成员间共享。重试忽略覆盖并使用 expert，review 与写任务独立审查保持 expert。skill 补需求评估与人数选择，原则明确并行是减少总交付耗时的手段。尚未放开同项目并行写，也未做付费真实协调开销/效率对照；本轮证据以 docs/STATUS.md 最新条目为准。

## 0.5.0 已交付与主目录同步（2026-10-13）

本节补充 worktree 已验证的实现；下方主目录原有方案全部保留。跨项目通用已交付，不代表同项目并行写改造完成。代码同步到本主目录，原有暂存区保持。

## 0.5.0 用户补充目标（2026-10-13）

用户要求简化为在 Codex 安装一次供所有项目使用，换项目不应改配置或重新打包。新包移除固定 workspace，由队长从当前聊天目录/授权目标自动传参；任务创建后仍锁定身份。按项目隔离任务、owner、模型确认与持久偏好，同连接可由任务 ID 定位已知项目，重连由队长补路径。CLI 全局配置用 cwd 或 --workspace；旧固定配置仍兼容。实施与最终证据见 STATUS.md 最新条目。

## 当前执行口径（0.4.1，2026-10-13）

以下旧审计和步骤保留为历史记录，发生冲突时以本节与 `docs/STATUS.md` 最新条目为准。
前期 worktree 未包含主目录暂存的 `docs/UPGRADE-BRIEF.md`。同步到主目录时已补读，并保留下方最新方案；简报中同项目并行写、逐任务 model/effort、可选模型确认与真实协调耗时评测仍待完成。

- P2-C 已收口：嵌套未知字段迁移提示、默认勾选记住且要求真人提交明确 remember、关闭/撤销、官方 SDK 四类表单能力与可达 CLI 指引、MCP 示例模板。
- `complexity=uncertain` 保持；改为 bounded 仍走 expert，不能让轻量分工生效。此前“改默认值”的设想已证伪，不执行；SDK required 裁剪也不执行。
- P2-A、P2-B 和 P1-D 依最新状态已完成/结案，下面“第 9～11 步”及“哈希完全未动”是过期记录，不重复实施。
- CLI 长任务已接前台阶段/定期 stderr 回执，stdout 保持 JSON；修复信号关闭与终态读取竞态。
- P3 已补可安全实施部分：0.4.1 版本一致，manifest 共有元数据一致且遵守不同官方格式，不再快照构建 PATH，打包绑定可执行文件，Windows 提前拒绝。旧 dist 产物不删除，死代码移除不作为本轮修复。
- 本轮验证及剩余边界集中记录到 `docs/STATUS.md`，不把受控模拟视为真实模型验收。


---


日期：2026-10-13（Asia/Shanghai）· 源码版本 0.4.0 · HEAD `646f8f6`
依据：本轮只读审计（含两轮并行车道与对抗验证），以及用户两次澄清的目标。

**用户最终澄清的目标（本方案的对齐基准）**：开始一次项目修改时，先调团队插件 → 队长评估这次改动是什么 → 决定开几个成员、各做什么 → 各成员按任务采用不同推理强度 → **多个子任务同时开工，队长也承担一块** → 加速提效。用户选 agent 可省略，**队长先指定即可**。

**文档性质**：记录已完成什么、没完成什么、每步怎么验证、以及必须遵守的边界。**"已完成"一律指本机离线单测；真实宿主验收单独标注。**

---

## 零之一、最终方案总览（先读这一节）

### 当前状态一句话

**单任务可靠性已经做得比较扎实，但离用户目标（多写成员并行）还差一个结构性改造，且这个改造不该现在做。**

### 三条结论

1. **原两条痛点（感知低、委派重）已基本解决**，且拿到了真实宿主证据（见 0.4）。修复已随 HEAD `646f8f6` 进入已装缓存。
2. **产品偏离了主线——偏在"并行"这条轴，根因在 `PRINCIPLES.md:7`，不在代码**（见零之二）。代码忠实执行了一条与用户目标不符的原则。
3. **并行写的真正阻塞是 `workspace.js:234`，是结构性不可满足的**（见零之三），不是 Codex 所指的那行。不是"删一行判断"能解决。

### 建议的执行顺序（最终版）

| 顺序 | 做什么 | 为什么是这个顺序 | 成本 |
|---|---|---|---|
| **第 1 步** | 修 `PRINCIPLES.md:7` 对"并行"的表述 | **不修它，后续任何并行改动都会再次被原则判为"偏离"** | 极低（改一段话） |
| **第 2 步** | 跑一次**真实项目修改**，量协调开销 | 所有并行收益都是**未验证假设**；先拿数据 | 你的一次真实任务 |
| **第 3 步** | 给合同加**逐任务 `model`/`effort`** | 与并行无关、便宜、立刻兑现"推理有高有低" | 小（单文件为主） |
| **第 4 步** | 视第 2 步数据决定：是否做**并行写阶段一/二** | 有数据才有依据；无数据就是给假设加杠杆 | 中~大 |
| **第 5 步** | P3 产物卫生（清 dist、统一 manifest、PATH 脱敏） | 独立小项，随时可做 | 小，但删 dist 需你授权 |

---

## 零之四、本轮验证到的事实与未验证边界（2026-10-13 最新）

### 已验证（有证据）

| 事实 | 证据 | 意义 |
|---|---|---|
| **双 content block 在真实宿主里确实被透传** | Codex 会话记录里出现 `Agent Teams · 等待模型确认 / 本次调用未启动新成员…`——**这些句子只存在于 `toolFeedback()` 输出**（原始 JSON 里是 `"confirmationRequired": true`） | **感知层第一次拿到真实宿主证据**。此前一直挂在"无法证明第二块会被渲染" |
| 已装缓存代码 == HEAD `646f8f6` | `diff -rq ~/.codex/.../0.4.0/src src/` 干净（exit=0） | **不必重新 build 就能验证本轮修复** |
| 四项修复已在缓存中 | `status.js:131` `memberExitConfirmed`、`:139` 取消优先、`runtime.js:117` `signal.aborted` 守卫 | — |
| 工作区绑定已指向 coderSkills | 缓存 `teams.config.json` 的 `workspace` = coderSkills；`config.toml` 注册的市场来源 `dist/marketplace-v0.4.0-1791878063177` 内同为 coderSkills | 之前"工作区不一致因此停止委派"**已解决** |
| 四项状态一致性缺陷全部复现并修复 | 用户审查与主 Agent 审查**逐条吻合**（同行号同机制）；182/182 通过，新增 2 个回归 | 见 1.9 |
| 三份并行写设计全部被证伪 | Workflow 三车道 × 各一对抗验证者 | 见零之三 |

### 未验证（不能声称）

- **本轮修复只跑过离线单测**，未跑真实 App Server 真机任务、未重装缓存（但缓存已含同版本代码）。
- **同条件效率对照从未做过**（单强模型 vs 原生子 Agent vs 本插件）。这是"多成员是否更快"的**唯一**答案来源。
- 桌面 UI 点击、父聊天唤醒**从未验证**。
- `examples/mcp.config.toml` 修正后**未被真实宿主加载验证**。
- Windows 会在 `app-server.js:15` / `verification.js:47` 安装后才失败，未在安装前声明。

### 当前已知阻塞（跑真实任务前必须解决）

**成员目前起不来**，原因链：

1. coderSkills 状态库 `modelPreference` **为空** → `teams_start` 抛 "User model confirmation required"；
2. 本宿主里 `teams_models(confirm=true)` 返回 **`decline`**（外层 `approval_policy` 导致，**不是用户点了拒绝**）；
3. 状态库**单 owner**：pid `73996`（MCP server）持锁，终端里跑 CLI 会被 `store.js:31` 的 owner 互斥拒绝。

**解锁路径**：关掉 Codex 会话（释放 owner）→ 在独立终端 `node src/cli.js start --config /tmp/coderSkills-teams.json --id <task-id>` 交互确认并选 **remember=yes** → 重开 Codex，MCP 会通过 `modelPreference`（scope=workspace）自动复用。

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

## 零之二、产品主线偏移诊断（2026-10-13）

**用户澄清的原始意图**：开始一次项目修改时，先调团队插件 → 队长评估这次改动是什么 → 决定开几个成员、各做什么 → （理想情况让用户选 agent，**为简便可省略，队长先指定**）→ 各成员按任务采用不同推理强度 → **多个子任务同时开工，加上队长也承担一块** → 加速提效。

**结论：确实偏离了，但偏离的是一条轴，而且这不是实现疏忽。** 队长—成员—验收骨架扎实；偏的是**并行**。根因不在代码，在原则文档。

### 决定性证据

`PRINCIPLES.md:7` 白纸黑字写着：

> 这里的效率指从需求到正确交付的总耗时与用户投入，**不是单次模型响应速度，也不是并行成员数量**。

**项目主动把"并行成员数"从效率定义里剔除了。** 后续所有代码都忠实执行了这条原则——把力气投在"把单个任务做可靠"上。所以这是**优先级选错，不是实现跑偏**：代码没有背叛原则，是原则与用户目标不一致。

### 逐项核对（均已在本机源码核实）

| 用户要的 | 当前实现 | 判定 | 证据 |
|---|---|---|---|
| 队长评估整个修改任务 | 有；skill 要求当前聊天担任队长 | ✅ 具备 | `skills/team/SKILL.md` |
| 队长决定开几个成员 | 有上限，但 **skill 未规定"如何决定人数"** | ⚠️ 部分 | 默认 2、上限 4：`contracts.js:13` |
| 用户选 agent | 无 | ❌ 用户已说可省 | — |
| 每任务选模型 + 推理强度 | **合同无此字段**，只能走预设两档 | ❌ 缺失 | `contracts.js:29`；`policy.js` `selectProfile` |
| 多成员**并行** | 只读可并行；**写任务完全独占** | ❌ **核心缺失** | `runtime.js:81` |
| 队长自己也改一块 | 受限（源工作区被改即拒绝集成） | ⚠️ 受限 | `runtime.js:280` |

**并行那行**（`runtime.js:81`）一条判断决定两件事：

```js
if ((task.executionPlan && this.active.size) || [...this.active.values()].some(entry => entry.workspaceBound))
  throw new Error('Verified-worktree tasks run exclusively until member and command exit');
```

写任务必然带 `executionPlan` → 必然独占。**且只要有一个工作区绑定任务在跑，任何新任务都不能启动**，连只读的也不行。`maxConcurrency`（默认 2、上限 4）对写任务形同虚设。

### 真正的阻塞（本节初版结论已被修正，见零之三）

本节初版把阻塞定位在 `runtime.js:280` 的源摘要检查。**经对抗验证后修正：那只是第二道门，真正的结构性阻塞是 `workspace.js:234` 的 `captureTree(...) === candidate.tree`，且它对第二个写者构造上不可满足。**

简化后的因果链：

1. 两个写成员从**同一基线**各自建 worktree、各自改、各自完工；
2. 第一个集成后源工作区内容变化 → 第二个的 `runtime.js:280` 摘要检查被拒；
3. **即使放开 `:280`**，`workspace.js:234` 仍会拒——因为 `captureTree` 返回**整棵源工作树**，而 `candidate.tree` 是**该成员自己的增量树**，两者必然不等，**与文件是否相交无关**（主 Agent 已亲手复现，见零之三）。

**结论不变且更强**：并行写不是删一行判断，需要一次结构性改造。完整方案与证据见**零之三**。

---

### 模型与强度：为何"推理程度有高有低"做不到

`contracts.js` 的合同顶层字段只有 `profile: auto|expert|simple|qualified`，**没有逐任务的 `model` / `effort`**。`policy.js` 的 `selectProfile` 只在这几档之间路由。"这个成员用强模型高强度、那个用轻量"当前无法表达——**这是与并行无关的独立缺口，且补起来便宜。**

### 本轮（含主 Agent）工作方向的自省

这一段时间的工作——用户模型确认、目标绑定、执行前预检、状态感知、以及主 Agent 修复的四条状态一致性缺陷——**全部在"单任务可靠性"这条轴上加深**。质量不错是另一回事，**方向确实离用户目标越来越远**。主 Agent 的最近几轮同样没有跳出这条轴。

### 结论与约束

**不应立即投入并行写机制。** 理由不是难，是**没有数据支撑**：

- 仓库 42 个定义用例，实际跑过 3 个，且**已标注过期**；
- **从未做过同条件效率对照**（单强模型 vs 原生子 Agent vs 本插件）。

在"多成员是否真比单模型更快"完全未测的情况下投入并行写机制，是**给未验证的假设加杠杆**。且"拆分 + 协调 + 复核"的开销可能吃光并行收益——这正是用户自己点到的顾虑。

**因此顺序**：
1. 先用本插件跑一次**真实项目修改**，量出**协调开销**（队长拆任务耗时、成员等待、复核耗时）；
2. 若瓶颈确为"队长排队等成员"，**再补并行写**；
3. 并行推进一项**便宜且立刻有用**的改动：给合同加**逐任务 `model`/`effort` 覆盖**，兑现"推理程度有高有低"。

---

## 零之三、并行写根治方案（经对抗验证修正，2026-10-13）

用 Workflow 跑了三条设计车道（并行写 / 逐任务模型 / 队长编排），**每条各配一个独立对抗验证者**。结果：**三条全部 REFUTED**，其中并行写这条的证伪直指方案要害。

### 最重要的证伪：`workspace.js:234` 是结构性阻塞，不是"前置检查过早"

原设计（车道一）主张：执行可并行、只把串行下推到集成点，并断言 `:234` 的 `captureTree(...) === candidate.tree` 是"静默三路合并的防线，保持不变即可"。

**这个断言是错的。** 验证者指出：`captureTree` 返回**整棵源工作树**，而 `candidate.tree` 是**该成员自己的增量树**。所以第一个写者落地后，第二个写者的两棵树**必然不相等**，与文件是否相交无关。

**主 Agent 已亲手复现**（两个不相交文件的 scratch 仓库）：

```
candidate.tree (D0 + f2 改动)        = a121cbf75805e50523952f32e1ba634120758016
captureTree(head=D0) 整棵源工作树     = 4ee2462c336faad285e358b4338b0061381aaa54
=> DIFFERENT：:234 连不相交的第二个写者一起拒
```

**结论**：`:234` 对"第二个写者"是**构造上不可满足**的。只改 `:81`（独占）、`:231`（摘要）**都无效**——第二个成员的改动永远落不了地。这是整个并行写问题的真正地基。

### 另外三处被证伪的细节（均为实读源码或复现）

| 被证伪的说法 | 事实 | 证据 |
|---|---|---|
| "集成失败后回退队长复核" | **该回退路径不可达**。`canRetry` 白名单不含 `integration_failed`，`review()` 又要求 `awaiting_review`。第二个写者不是"等待复核"，是**死掉** | `runtime.js:82`、`:245`、`:308` |
| "改 `:431` 的 `active.size !== 1` 即可让并发成员进入验证" | 真正的序列化是**单一验证槽 `this.verification`**，不是 `active.size`。且该槽被 `:24`/`:35`/`:41`/`:401` 四处读取，改成 Map 会让 `:401` 的判断永久 undefined——**静默删掉一道守卫**，并使 `tests/verification.test.js:145-146` 失败（原设计的 testImpact 未列该文件） | `runtime.js:72,401` |
| "已 grep 确认无测试断言这些字符串" | **假阴性**。`tests/write.test.js:126` 用正则断言 `/Source workspace changed/`，不是逐字匹配 | `tests/write.test.js:126` |

### 正确的根治路径（最小且诚实）

验证者给出的方向，主 Agent 认同：**执行可并行，落地必须串行，且第二个写者不得靠拼接补丁硬上**。

**阶段一（便宜，立刻兑现"多成员同时开工"）**
- 放开 `runtime.js:81` 的 `workspaceBound` 全进程排他，保留 `maxConcurrency` 容量门 → **多个写成员可以同时在自己的 worktree 里干活**（推理是真正的墙钟大头）。
- `integrate()` 保持独占（`assertWorkspaceIdle` 不动）——"先集成谁"本就不是可并行的决定。
- 诚实代价：此阶段**第二个写者仍无法直接落地**。必须先解决下面的 `:234`，否则"并行开工"只是让第二个成员**白干得更快**。

**阶段二（真正解锁落地，本方案的核心改动）**
把 `:234` 的证明从"整棵源树 === 我的增量树"改为**按补丁触及路径的落地证明**：
- 证明范围收窄为**恰好补丁触及的那些路径**：应用后，这些路径的内容必须等于补丁的 post-image；
- 且**没有其他路径发生变化**（应用前后对比变更集合）；
- 这道证明**仍然拦得住**静默合并——三路合并会让补丁路径的内容偏离 post-image；
- 保留 `captureTree` 用于"没有未预期路径被改动"的整树比对，只是不再拿它和 `candidate.tree` 相等。
- **不要加 `--no-3way`**：验证者实测该 flag 不改变任何 `--check` 结果，只会让行为依赖 git 版本。

**阶段二必须连带重跑的证据（不可省）**
第二个写者落地前，`D1 + B` 这个组合**从未被执行过**，所以：
1. 命令验证必须重跑（沿用 B 在 D0 上的旧 receipt 是**虚构证据**，正是 AGENTS.md 禁止的"把未验证结果标为成功"）；
2. **独立专家审查必须重跑**（原 packet 只含 B 自己的 patch，合并态下应审整体 diff，这是唯一能发现语义冲突的输入）；
3. 队长复核必须重新进行（`review()` 把 `verificationId` 钉进记录，旧 receipt 已失效）。
**但不重跑成员推理**——B 已完成的代码成果保留，只重跑确定性检查。这是"省墙钟但不省验证"的平衡点。

**阶段三（配套）**
- `canRetry` 需明确纳入或明确排除 `integration_failed`，并让 `:308` 的落点与 `review()` 的前置条件自洽（当前是**回退路径不可达**，属既有缺陷，非本次引入）。
- 改写 `tests/attempt.test.js:208`、`:214`（全仓唯一以 `/run exclusively/` 为键的断言），补并发写的三条回归：不相交两写者全部落地、同处修改被拒且源不被改动、并发下 `cancelVerification` 取消的是正确工作区。

### 逐任务 `model`/`effort`：**本轮未产出可用设计**

分配给这条车道的任务被车道理解成了"收窄独占粒度"，产出的是又一份并行写方案，**没有回答逐任务模型覆盖怎么做**。因此该项**仍为空白**，需单独一轮。已知约束：`contracts.js:29` 无该字段；`policy.js` 的 `selectProfile` 只路由 `expert`/`simple`/`qualified`；重试规则禁止"被拒绝的廉价运行静默重复"。

### 两条必须记录的教训

1. **三轮连续的设计-验证中，三条设计全部被证伪，且没有任何一条的证伪来自设计者自身。** 对抗验证者必须保留，不能省。
2. **主 Agent 的 brief 写错了一处文件路径**（把 `coderSkills` 仓库的 `scripts/validate-skills.py` 当成本仓库的），验证者当场指出"该文件不存在"。这验证了同一件事：**验证者确实在独立核对，包括核对下发指令本身**。

### 与 ROADMAP 的关系

`docs/ROADMAP.md` 把并行写列为"确认收益后再考虑"。本节的结论是：**并行写不是"再考虑"级别的小改动**——它有结构性阻塞（`:234`）和必须重跑的证据链。因此**顺序不变**：先跑真实项目修改量出协调开销，确认瓶颈确为"排队等成员"，再动阶段一/二。

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

### 1.9 第 3 轮收口记录：四项状态一致性缺陷（2026-10-13）

**本机验证：182/182 通过，0 fail/cancelled/skipped。**

用户与主 Agent 各自独立审查同一版本，**四条结论逐条吻合**（同行号、同机制），均在 HEAD `646f8f6` 之前引入。**最重要的记录：四条缺陷没有一条由现有测试捕获**——`attempt.test.js:192` 当时正在断言其中一句错话，97.18% 行覆盖率与之共存。**覆盖率不能作为此类缺陷的发布依据。**

| # | 缺陷 | 归属 | 修法 |
|---|---|---|---|
| A | 主动取消被误记为超时：取消后清理跨过截止时间，deadline 定时器仍接管已 abort 的 controller，记录成 `timed_out`+`task_deadline_exceeded`，而 `error` 仍是 "Cancelled by captain" | 本批引入 | `exceedDeadline()` 先判 `controller.signal.aborted`；取消路径**不再写 `failure`** |
| B | 退出未确认却提示"无残留进程"：文案断言"未检测到需确认的残留进程"，而同记录 `cleanupConfirmed:false`、进程组存活、重试被退出门禁拒绝 | 本批引入 | 运行时文案删除该断言，改"重试前确认成员进程已退出"；显示层新增 `memberExitConfirmed`，**从记录事实读取** |
| C | 重试历史漏显示旧验证结果：所有 attempt 都用最新 attempt 的工作区查验证记录，早期 attempt 已 `passed` 的检查显示为 `null` | 本批引入 | 按 attempt 各自的 `workspaceId` 解析 |
| D | 具体修复指引被通用文案覆盖：`verification_executable_missing → 安装缺失的验证程序` 被替换为"检查错误与退出记录" | 本批引入 | 回到"具体优先"，并在源头修取消路径（取消不写 failure） |

#### 对抗验证的两个车道（均以可复现证据为准）

- **车道一证明修复真实生效**：删掉守卫重跑同一场景得 `timed_out`，加回守卫得 `cancelled`。并确认 Node 24 上二次 `abort()` **不覆盖**首个 reason——这是该修复成立的前提。
- **车道二挑出主 Agent 自己新写的字段有缺陷**：`memberExitConfirmed` 对**运行中** attempt 报 `true`（`cleanupConfirmed` 在终态前不存在，`undefined !== false` 为真），等于给活着的进程断言"已确认退出"，且该字段当时**没有任何消费方**。已改为 `?? null` 并补回归。
- **车道二另指出**：上一批取消路径曾写入 `failure`，**已在磁盘上的历史记录不会被迁移**，恢复具体优先会让旧记录重现误导指引。已在读取处一并兜住并补回归。

#### 证伪记录（保留）

- 原审查建议"删掉那句文案"即可修 B。实测确认运行时写该句时清理**确实未确认**，问题不是措辞而是**断言位置**。
- 早前"改 `complexity` 默认值让轻量模型生效"的设想：实测 `auto + bounded` 仍走 EXPERT，仅显式 `simple` 生效——**该设想不成立**，已从计划移除。

#### 已确证但**未处理**（记录备查，非本批范围）

- `integrate()` 有独立 deadline 定时器，**无同类守卫**；队长在集成期间取消会被记为 `integration_failed`，与"集成超时"不可区分。该行为自 0.2.0 起被 `tests/write.test.js:263` **主动断言**，改动需先定产品语义。
- `shutdown()` 与 `cancelVerification()` 复用任务 controller，会使任务被记为 `cancelled`。经查 `cancelVerification` **无 MCP/CLI 暴露面**，当前不可达。

#### 本轮新增回归

2 个：取消跨截止时间仍为取消（`core.test.js`）、退出确认的三种取值 + 历史取消记录不被旧 failure 覆盖（`status.test.js`）。另更新 2 个原先**锁定错误行为**的断言。

**边界**：以上均为受控协议与本机命令复现，**未运行真实模型推理、未跑远程 CI、未重建插件包**。不代表真实宿主已发生同类组合故障。

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

- `dist/` 现有 **12 个目录、约 191MB**（本轮复核更新；此前记录的"9 份/144MB"已过时），
  全叫 `codex-agent-teams-local`；`build.js:52` 撞名加时间戳但不删旧的，升级极易 add 到旧包。
  `scripts/clean-dist.js` 默认空跑，**删除需用户显式授权**。
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

**历史（第 1~7 步，均已收口）：**

```
第 1 步  决策并修掉 4 个测试失败（根因甲改测试、根因乙选 A+B）        ✅ 2026-10-12，见 1.7
第 2 步  跑全量 + coverage，确认回到全绿                              ✅ 2026-10-12
第 3 步  P0-B 超时/取消分离 + 回归                                   ✅ 2026-10-13，见 1.8
第 4 步  P0-C 心跳显示                                               ✅ 2026-10-13，见 1.8
第 5 步  P1-A / P1-B / P1-C 三个静默失败与锁死问题 + 回归             ✅ 2026-10-13，见 1.8
第 6 步  P2-D SKILL.md 重写                                          ✅ 2026-10-13（并行车道，主 Agent 复核）
第 7 步  P3 产物卫生（clean-dist 工具 + 示例修正）                     ✅ 部分完成；dist 本体未删
────────  第 8 轮（本文件 1.8 记录） ────────
第 8 步  P2-C 降摩擦                                                 ✅ 大部分完成（required 裁剪一项已证伪，移除）
第 9 步  P2-A 错误分类细化 + 暴露 validationFailure.resultExcerpt      ✅ 2026-10-13（改用结构化码，比原计划更好）
第 10 步 P2-B 砍冗余全树哈希                                         ✅ 2026-10-13（3 处中改 2 处、拒绝 1 处）
第 11 步 P1-D maxConcurrency 实质失效                                 ✅ 结案：文档化，非失效
第 12 步 P3 剩余                                                     ⏳ 未做：清 dist 旧副本、统一 manifest、PATH 脱敏
────────  第 9 轮（本文件 1.9 记录） ────────
第 13 步 四项状态一致性缺陷修复 + 回归                                ✅ 2026-10-13，见 1.9
```

**下轮起点（最终版，对齐零之一的总览）：**

```
第 14 步 修 PRINCIPLES.md:7 对"并行"的表述                        ← 从这里开始（不修则后续并行改动会再被判为偏离）
第 15 步 跑一次真实项目修改，量协调开销（队长拆分/成员等待/复核耗时）
第 16 步 给合同加逐任务 model/effort（兑现"推理程度有高有低"）
第 17 步 视第 15 步数据决定：是否做并行写阶段一/二（见零之三）
第 18 步 P3 剩余：清 dist 旧副本、统一 manifest、PATH 脱敏（删 dist 需用户授权）
```

**基线状态：182/182 全绿（`git status` 只有本文件改动）。**

## 六、尚未验证 / 已知边界

**已完成并已验证：**

- 四项状态一致性缺陷（取消误记超时、假"无残留"、旧 attempt 丢验证、具体指引被覆盖）已修复，新增 2 个回归，见 1.9。
- **双 content block 拿到真实宿主证据**：Codex 会话中出现了只存在于 `toolFeedback()` 输出的中文回执，见零之四。
- `docs/STATUS.md` 头部版本号已从 0.3.0 修正为 0.4.0。

**仍未验证（不能声称）：**

- **本轮修复只跑过离线单测**。已装缓存代码与 `HEAD` 逐文件一致（`diff -rq` 干净），
  说明同版本代码已在缓存中，但**未被真实模型任务跑过**。
- **同条件效率对照从未做过**（单强模型 vs 原生子 Agent vs 本插件）。这是"多成员是否更快"的
  **唯一**答案来源，也是"并行写该不该做"的前置条件。
- CLI `start`/`run` 仍是阻塞等待（最坏 610 秒且无进度输出），未动。
- 桌面 UI 点击、父聊天唤醒**从未验证过**，不能声称。
- `examples/mcp.config.toml` 的 `tool_timeout_sec=330` 修正**未被真实宿主加载验证**。
- Windows 会在 `app-server.js:15` / `verification.js:47` 安装后才失败，未在安装前声明。

**已知阻塞（跑真实任务前须解决）：**

- **成员起不来**：`modelPreference` 为空 + 本宿主 elicitation 返回 `decline` + 状态库单 owner
  互斥。解锁步骤见**零之四**。

**产物卫生（需用户授权）：**

- `dist/` 现有 **12 个目录、约 191MB**（此前记录的 9 份/144MB 已过时）。
  `scripts/clean-dist.js` 默认空跑，**删除需显式授权**。
- `dist/marketplace-ui-v0.4.1-*` 的版本号在源码中不存在，属无源出处的包。

**流程教训（保留）：**

- 并行车道期间与主 Agent 改动并发时，中间的测试失败**不具备判定力**；结论一律以最终串行全量为准。
- **不要把手道的自述当作已验证**——Workflow 的验证阶段曾整段未运行（见 1.8）。
- **三条并行写设计全部被对抗验证者证伪，无一来自设计者自身**（见零之三）。对抗验证必须保留。
- 主 Agent 曾在下发指令中写错文件路径（把另一仓库的脚本当本仓库的），被验证者当场指出。
  **验证范围必须包含"核对前提本身"。**
