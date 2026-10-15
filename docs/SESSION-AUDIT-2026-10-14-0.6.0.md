# 0.6.0 本轮会话记录与插件审查

后续状态：另一次会话通过源码临时 MCP 连接完成真实只读请求、报告验收及新 S3 修补，详见 [源码真实复验与续查](SESSION-AUDIT-2026-10-14-FOLLOWUP.md)。本文保留修补前两次失败及当时未真实复验的历史事实；正式缓存仍未更新。

日期：2026-10-14，Asia/Shanghai。宿主聊天 ID：`01a138d7-8947-7cb3-bf29-0b38953d9f55`。
用户请求：“排查项目bug于升级需求 同时记录本轮会话的详细 后续以本次会话为例子同步审查一下插件的局限性和bug”。

本轮完成排查、可重复证据及升级验收方案，并对确认的两个最小缺陷完成源码修补和回归。两位真实成员在修补前均因输出 schema 被服务拒绝而失败，未交付独立审查报告；后续结论由队长检查源码和执行复现得出。不得把这份文档称为“两位成员审查通过”或“真实模型复验已完成”。

## 1. 执行现场与授权范围

- 执行及交付目录：`/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`。
- 开工核对 `pwd`、`git worktree list`、`git status --short`。主目录已有 44 个文件的暂存改动；本轮开始时没有未暂存改动。暂存树为 `5883ba02ce16b6e17f8078aee4e0bdb7664fa920`，不沿用历史文档中的旧暂存树编号。
- 读取 RTK.md、项目 PRINCIPLES/ROADMAP/STATUS，以及用户明确指定的已安装 team skill 和插件 PRINCIPLES。默认不读取 ignored 项目内容；状态通过插件工具观察，没有直接读取 `.codex-teams` 数据库、用户配置或依赖内部文件。
- 用户显式调用 `codex-agent-teams:team`，本轮使用 Agent Teams MCP 建立两个只读合同。没有创建写成员、复制父聊天记录、更新正式缓存、commit、push 或发布。
- 报告位置与源码位置相同，不需要跨 worktree 同步。创建合同与启动成员产生的任务记录由插件运行时持有；这不属于源码改动。

## 2. 分工与合同

两个任务可独立审查，默认并发 2。队长保留 MCP 实际使用检查、会话记录、源码复核、复现及最终判断；成员不承担共享 STATUS 文档。

| 项目 | 动作与增量观察审查 | 工作区与集成门禁审查 |
| --- | --- | --- |
| 标题 | 0.6.0 动作与增量观察边界审查 | 0.6.0 工作区与集成门禁审查 |
| taskId | `b82265a0-8978-4b4d-8f38-b805520460ea` | `690f22eb-ea7b-40ae-98b9-74cd5cb3b348` |
| attemptId | `fe982010-d8bc-4c37-830e-d849764a1d8c` | `530db58e-5e59-4181-8fc7-651f5cddea66` |
| 范围 | actions.js、observation.js、app-server.js 的相关调用 | workspace.js、runtime.js 的 candidate/evidence/integrate/recovery 门禁 |
| 模式 | review / bounded / read-only，无 executionPlan | review / bounded / read-only，无 executionPlan |
| 模型与强度 | `krill/gpt-6.1-sol / high` | `krill/gpt-6.1-sol / high` |
| 选择来源 | captain-explicit，仅本次 attempt | captain-explicit，仅本次 attempt |
| 创建 UTC | 2026-10-14T05:18:49.187Z | 2026-10-14T05:18:49.236Z |
| 开始 UTC | 2026-10-14T05:20:06.477Z | 2026-10-14T05:20:06.616Z |
| 结束 UTC | 2026-10-14T05:20:07.720Z | 2026-10-14T05:20:08.169Z |
| 运行时耗时 | 1243 ms | 1553 ms |
| 终态 | failed | failed |
| threadId | `01a138da-8184-76b2-b010-d9373ada56d5` | `01a138da-8217-7450-b514-e7b58e622c7a` |
| turnId | `01a138da-81af-7990-a55f-933eebe8bc9c` | `01a138da-823a-7213-b605-dd9a0a7c96d5` |
| childPid / 退出回执 | 87792 / cleanupConfirmed=true、memberLaunch=exited | 87921 / cleanupConfirmed=true、memberLaunch=exited |

两个合同的 acceptance 完全相同，按原文记录：

1. 每个确认发现给出当前file:line、触发条件、预期/实际、证据类型与最小复现；无发现则说明实际检查的分支。
2. 将确认bug、未验证假设、设计局限分开，并给出最小修补或升级方向和对应验收。

必要上下文明确：审查当前文件而非 HEAD；不改源基线；最多三个发现；不重复已修历史问题；静态或纯内存检查可完成合同；临时 Git/协议子进程 fixture 由队长执行；未执行测试不能声称通过；已满足合同的验证边界应写 limitations，不应写 blockers。工作区合同额外列出四项历史已修边界，避免重复计数。

## 3. 实际工具链与回执

以下记录的是操作与结果，原始宿主聊天仍是完整工具交互来源。本文件不保存连接游标、随机面板访问令牌或重复的完整源码输出，也不是成员命令重放日志。

| 顺序 | 调用与关键参数 | 本轮结果及判断 |
| --- | --- | --- |
| 1 | `teams_models({workspace: 主目录})` | 发现 12 个实际模型；configuredModel=krill/gpt-6.1-sol、configuredEffort=high；selection=null、confirmationRequired=true、captainSelectionSupported=true、inferenceStarted=false。无需用户重复填写路径或代填表单 |
| 2 | 两次 `teams_create`，expectedWorkspace=主目录 | 合同创建为 pending，尚未启动成员；原两条 acceptance 见上文 |
| 3 | 两次 `teams_start`，models.expert={model:krill/gpt-6.1-sol, effort:high} | 返回 running 启动回执；当时不能声称已交付或验收 |
| 4 | `teams_status({workspace: 主目录,panel:true})` | 返回 loopback 状态页，refreshMs=2000、readOnly=true、lifetime=mcp-connection；仅调用一次 |
| 5 | 两次 `teams_status({taskId,incremental:true})` | 首次快照均显示 failed；原错误指向 response_format 的 required 缺少 limitations。actions、summary、用量均无记录 |
| 6 | `open_in_codex({target:browser,placement:right})` | 宿主返回 queued，threadId 为本聊天；只确认打开请求排队，未确认页面已显示、刷新或用户看见 |
| 7 | 两次 `teams_status({taskId,verbose:true})` | 核实原始错误、attempt/thread/turn/PID、cleanupConfirmed=true；failure.code=member_turn_incomplete。成员无 report，不调用 teams_review |
| 8 | 队长直接复核 contracts/policy/app-server/preflight、status/mcp/router、actions/observation、workspace/runtime 与相关测试 | 找到 schema 根因、增量回执遗漏和模拟测试缺口。工作区静态检查未确认额外新 bug，不把未复现的猜测写成发现 |
| 9 | 队长纯内存脚本及四组定向测试 | 复现缺少 required 字段、旧报告仍能读取、增量文字回执缺少已有信息；69/69 离线测试通过 |
| 10 | `teams_status({workspace: 主目录,overview:true,limit:2})` | capturedAt=2026-10-14T05:22:02.042Z；viewer/runtime 都为 0.6.0，sourceRoot 都为正式 0.6.0 缓存。项目 total=8、running=0、awaiting=0、succeeded=5、attention=3；其中成功数属于历史，不能归给本轮 |
| 11 | `teams_wait({taskId: 动作任务,timeoutMs:10000,afterCursor: 首次游标})` | 已结束任务立即返回 unchanged=true，仍 failed；回执“Agent Teams · 没有新记录”。没有重试、自动降级或后台轮询 |

模型发现回执：“Agent Teams · 可由队长指定模型”；启动回执明确“这是启动回执；实际阶段以状态记录为准，尚未验收”。
两份完整失败回执的下一步均为：“主 Agent · 成员回合未正常完成（可能被中断或模型报错）。查看原始错误与退出记录，确认证据后再显式重试。”

面板与模型信息的来源：插件工具回执。viewer 为 packaged，build.createdAt=`2026-10-14T05:11:46.123Z`，sourceDigest=`b7ffffe62d166f8371e881031f01bdea1221271297e3d6cc5668be272644ab5c`。本轮确认缓存已为 0.6.0；旧 STATUS/交付报告中“仍使用 0.5.2”描述对应此前时点，不应作为本轮状态。

## 4. 已确认 bug 与修补

### S1：模型输出 schema 的可选字段导致启动失败（P1，已修补，待真实复验）

- 位置：`src/contracts.js:85`、`:88`；发送入口 `src/app-server.js:280`。
- 触发：在本轮实际可见的 `krill/gpt-6.1-sol/high` 上启动任意使用该 schema 的成员。本轮两个不同只读合同均失败。
- 预期：新成员可以提交含 limitations 的结构化报告；旧存量报告仍可缺少该字段。
- 实际：limitations 出现在 JSON Schema 的 properties 中，却未进入 required；模型服务拒绝请求，成员没有业务报告。
- 原因：旧报告解析与新模型生成直接共享 `resultSchema`。兼容旧报告的 `.optional()` 被原样带入严格结构化输出约束。
- 证据：两次实际模型请求拒绝回执，加队长当前源码纯内存复现。P1 理由是当前选定模型上的全部此类成员启动受阻。其他模型没有逐一运行，不能宣称已实测所有模型都失败；writer/reviewer 共用同一发送入口是静态影响范围判断，本轮没有启动真实写任务。

服务原始错误（两任务相同）：

```text
Turn failed: {"error":{"code":null,"message":"krill包月: Invalid schema for response_format 'codex_output_schema': In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'limitations'.","param":null,"type":"invalid_request_error"}}
```

最小复现，仓库根目录执行，无文件写入：

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { outputSchemaFor, validateResult } from './src/contracts.js';
const acceptance = ['schema fixture'];
const schema = outputSchemaFor(acceptance);
const missing = Object.keys(schema.properties).filter(k => !schema.required.includes(k));
assert.deepEqual(missing, ['limitations']); // 证明当前缺陷存在，断言成功不是修复成功
const legacy = { summary: 'legacy fixture', criteria: [{ criterion: acceptance[0],
  satisfied: true, evidence: 'in-memory fixture' }], findings: [], blockers: [] };
assert.equal(validateResult(legacy, { acceptance }).limitations, undefined);
console.log({ properties: Object.keys(schema.properties), required: schema.required, missing });
JS
```

本轮实际输出：properties=`[summary,criteria,findings,blockers,limitations]`，required=`[summary,criteria,findings,blockers]`，missing=`[limitations]`。仅在内存中给生成 schema 补齐 required 后，missing 为空；这不是实际修补或服务端接受证据。

已修补：`src/contracts.js:92` 在 `outputSchemaFor` 生成专用 required 列表，要求模型返回 `limitations`；`resultSchema` 仍保持 optional，旧报告缺字段继续可读。没有引入依赖或改变历史记录。离线验收见第 6 节，真实成员尚未用修补后的缓存重新发起请求。

### S2：增量文字回执遗漏错误和下一步（P2，已修补）

- 位置：`src/status.js:180`，变化摘要字段来源 `src/observation.js:31`。
- 触发：首次 incremental 快照或 changed 增量状态，包括本轮的两个 failed 快照。
- 预期：按 team skill，回执应指出阶段、下一执行者与下一步；成员失败应带有可行动的原因。
- 实际：JSON 有 nextActor/nextAction/error/elapsedMs，文字回执提前走 cursor 分支，只显示阶段、编号、更新时间和“尚需按合同验收”。失败原因和针对性指引被省略。
- 影响：按 skill 仅转述文字回执无法完整报告失败与下一步；本轮通过 verbose 补查恢复完整信息，增加交接成本。状态和原错误仍完整保存，没有丢失数据库证据。
- 证据：真实两个增量回执，以及队长直接调用 TaskObserver/toolFeedback 的纯内存脚本。changed JSON 的 nextActor=`主 Agent`，error 有值，但 feedback 不包含 error 或 nextAction。完整 verbose 回执正常，未受该分支影响。
- 已修补：`src/status.js:180-187` 的 changed/首次增量回执现在带有界耗时、下一执行者/动作和错误；unchanged 继续精简，不重复任务正文或制造进度。新增 observation 回归覆盖文字回执，真实 SDK 复验仍待执行。

## 5. 验证缺口与设计局限

| 类型 | 本轮证据 | 结论与边界 |
| --- | --- | --- |
| 验证缺口 | `tests/fixtures/fake-app-server.js:62` 只检查验收枚举，`:63` 返回无 limitations 的固定报告；本轮 69/69 仍全通过 | 模拟协议未验证严格输出 required，旧兼容解析恰好接受固定报告。不能用协议/SDK/doctor 无推理通过证明实际模型接受 schema |
| 错误分类改进 | `src/app-server.js:294` 把失败回合归为 turn_incomplete；`src/preflight.js:27` 给统一指引 | 原错误保存正确，但 schema 拒绝与中断共用 member_turn_incomplete。需尽量依据官方结构化错误分类，避免只用供应商错误文本作稳定协议；本轮未新增分类 |
| 宿主 UI 边界 | open_in_codex 返回 queued | 插件提供页面与打开请求，不保证宿主立即展示；本轮没有浏览器可见性验收，不能算插件页面打不开的 bug |
| 前台观察边界 | 无变化 wait 如实返回“没有新记录”；没有自动唤醒入口 | 已记录设计边界，不能推断成员正在推进，也不能保证队长在聊天结束后持续观察 |
| 记录覆盖边界 | 两成员 actions/result/usage 均无记录，服务在提交报告前拒绝请求 | 有 task/thread/turn/阶段/PID/错误/退出事实；没有成员业务命令、报告或完整思考日志。空 actions 不能证明完整重放能力 |
| 费用与效率边界 | memberUsage/reviewerUsage=null；两次只运行约 1 秒即失败 | 未知用量保持未知，不能推断零收费。失败时长不是有效审查效率，不与此前成功任务比较或宣称提速 |
| 工作区边界 | 队长静态检查 candidate/evidence/apply/integrate；没有本轮真实 writer/reviewer 或新 Git fixture | 同项目带计划任务独占、source drift 拒绝、ignored 依赖不复制等是现有边界，未新发现即不算 bug；本轮没有证明整个写链路再次通过 |

队长操作也有改进点：首次把较长 STATUS 与多个文档合读，输出被截断，随后补读当前章节恢复关键信息。这属于队长读取范围过大，不是插件 bug。今后先读当前状态和具体文件片段，避免重复输出历史。两次启动在同一并行批次，首个错误出现前第二个请求已发出；本轮没有在知道 schema 错误后继续重复请求。

## 6. 验证证据与验收判断

1. 修补前队长纯内存复现：命令 exit 0；Node v24.21.0。确认 S1 生成 required 缺失、旧报告兼容、内存候选 schema 补齐；确认 S2 changed 文字回执没有已有原因/动作。修补后同类脚本确认 required 完整且旧报告仍可读、回执包含错误和下一步。
2. 修补前定向命令为 69/69；修补后定向 `node --test tests/core.test.js tests/backend.test.js tests/actions.test.js tests/observation.test.js tests/mcp.test.js` 为 **83/83**，0 fail，日志 `/tmp/teams-session-fix-targeted-20261014.log`。
3. 修补后全量命令 `npm test` 为 **278/278**，0 fail/cancelled/skipped，64781.7765 ms，日志 `/tmp/teams-session-fix-full-20261014.log`。这些是离线测试与受控协议/子进程证据，不是实际模型审查报告。
4. 独立成员结果：两份 failed 执行记录，未交付报告，原两条 acceptance 没有成员证据。因此没有调用 teams_review(pass)，没有把失败任务改成 succeeded。
5. 队长最终判断：S1 是有真实请求证据、已完成源码修补但尚未用正式缓存真实复验的启动阻塞；S2 是已复现并已离线修补的回执合同不一致；验证缺口和现有设计局限分开记录。本轮未跑远程 CI、真实写入或同条件性能评测。

## 7. 后续最小升级合同（建议 0.6.1，尚未实施）

| 顺序 | 目标与最小范围 | 可验收结果 |
| --- | --- | --- |
| 1 | S1 生成 schema 与旧解析兼容分开 | **已完成**：properties/required 一致，旧报告缺字段仍读取，新增回归通过；模型服务真实复验待做 |
| 2 | S2 增量回执与 SDK 测试 | **已完成**：首次/changed 带阶段、耗时（有值时）、下一执行者/动作和有界错误；unchanged 保持精简；83/83 与 278/278 通过 |
| 3 | 验收部署版本与一次真实只读请求 | **待执行**：候选与源码一致，正式缓存升级需授权；用本轮失败合同显式重试并留 reason，实际返回报告后再逐项验收 |
| 4 | 按证据细化错误分类 | 核对当前官方 schema 的结构化错误字段；输出明确 schema/configuration 修复指引，保留原错误与退出记录；不以文本匹配替代可靠代码、不自动重复或降级 |
| 5 | 只在启动阻塞解决后评测效率 | 同基线/同合同/同验收，记录队长探索、派发、成员、观察、复核、返工及完整用量；未获得有效交付前不扩大为长跑或并行写改造 |

本轮交付本报告及 STATUS/ROADMAP 入口，直接写入主目录，均未新增暂存。运行代码与测试已在主目录修改，已有暂存内容和 HEAD 保持；正式 0.6.0 缓存本轮只使用和观察，没有更新。S1/S2 源码补丁已通过离线回归，但不把本次实际使用等同于已完成真实模型写任务或性能对照。
