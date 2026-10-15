# 委派收益与队长等待排查（2026-10-14）

后续用户已授权实施，当前修复与验收入口为 [0.6.2 修复记录](STOP-FIX-0.6.2-2026-10-14.md) 和 STATUS；下文“未修复/未实现”保留为排查时点的证据，不代表最新源码状态。

对象：用户指定聊天 `01a139b3-1a6d-7523-955f-1d2d98341952`，标题“追踪企融险 AI 审核入参与落库调用链”；插件主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`，当前工作树含此前已暂存升级。依据 PRINCIPLES.md 的准确率、总交付效率优先原则。本轮仅分析与记录，不修改运行源码、安装缓存或原项目任务。

## 结论

单成员并不天然无效：队长和一名成员可以并行完成两项独立工作，单成员也可以承担必要的独立审查。但如果队长把唯一待办交出去，自己只剩等待、转述和重新探索，普通分析任务应由队长直接完成。成员数量应由独立工作的收益决定，不应为了使用插件而凑人数。

本次证据不支持“只启动一名成员、队长只能干等”：聊天有两个不同 taskId 的 create/start，队长随后执行 AI 源码读取；该轮被中断，所返回聊天记录没有 teams_wait，也没有最终成员报告或验收。存在的是调度规则偏软、缺少可追溯的委派收益判断、最终报告前缺少业务证据交接，以及宿主中断和成员生命周期不联动的边界。

## 实际会话与运行回执

通过宿主 read_thread 读取用户指定聊天，turn 状态 interrupted，durationMs=206642；开始/结束秒级时间约为 UTC 09:16:41 / 09:20:08，上海时间 17:16:41 / 17:20:08。工具记录中的 start 耗时为 200 / 213 ms，这不是成员推理耗时，也不是整段派发准备耗时。

| 分工 | taskId | 插件记录开始时间（UTC） | 证据 |
| --- | --- | --- | --- |
| HTTP 入口、原始入参日志 | `1c22e781-9535-485d-b6da-77d00b0ed934` | 09:18:50.313 | 聊天 create/start + 项目 overview |
| 实体、Mapper、实际赋值与 SQL | `a8201a92-694e-4ae3-a9a4-d565f323593d` | 09:19:49.525 | 聊天 create/start + 项目 overview |
| 队长 | 宿主原聊天 | 第二次 start 后继续读取 | AIVerifyService、QrxClaimVerifyResourceImpl、QrxClaimVerifyService 的命令记录 |

第一名约在主轮开始 129 秒后启动，第二名约在 189 秒后启动，两次成员开始相隔 **59.212 秒**。这段包含队长规划、检索、模型及工具往返，不把整段归咎于 App Server 启动。对可独立的只读任务，先准备两份窄合同再紧凑派发可减少第二成员的延迟；是否减少最终交付时间仍需对照验证。

本轮调用插件 `teams_status({workspace:"/Users/anshunli1/jd/jdGit/product/java",overview:true,limit:10})`，快照 UTC **09:23:31.665**（上海 17:23:31.665）。查看工具和运行时均为 **0.6.1**，来源实际安装缓存 `/Users/anshunli1/.codex/plugins/cache/codex-agent-teams-local/codex-agent-teams/0.6.1/`，build digest `bc5e48373ac9196867a08f0a387f79179f4c5b5b97d492381d2ecd88435a10f5`。历史 STATUS 中“正式缓存仍为 0.6.0”是此前时点，不作为当前事实。

回执关键原文：

> 任务 2 · 执行记录 2 · 待验收/集成 0 · 已完成 0 · 需关注 0
>
> [1c22e781] 成员执行 · 281.4 秒 · group/auto-gpt-6-1-sol / high
>
> [a8201a92] 成员执行 · 222.1 秒 · group/auto-gpt-6-1-sol / high
>
> 下一步：执行成员 · 等待当前阶段完成

owner pid=14397、processAlive=true；两任务 status=running，memberExitConfirmed=null。快照中有中断时点之后的命令完成事件，说明宿主轮中断没有立即结束这两个插件 attempt。状态快照不保证模型持续推进，null 也不等于退出确认。未擅自取消其他聊天任务；原任务是否最终完成需另查终态。

本轮结束前再次读取同项目 compact 列表，两个同 attempt 的任务均变为 **awaiting_review**，回执分别为“[1c22e781] 等待队长复核 · 追踪 HTTP 入口与原始入参日志”和“[a8201a92] 等待队长复核 · 追踪 AI 审核落库字段与查询SQL”。这是报告到达，尚不是 succeeded。本轮没有审阅 Java 业务报告或代原聊天执行 review(pass)；其结论仍由原任务的队长逐项验收。

该快照成员 host totalTokens 合计 **1,066,486**，inputTokens=1,058,171，cachedInputTokens=893,952（输入子集），outputTokens=8,315。只有成员累计用量，缺少主线程同口径、价格、完整交付和对照组，不能折算实际费用或认定插件更慢、更贵；也不能忽略重复上下文及交接成本。

## 代码与规则定位

### 1. 启动前那句话来自 skill 的反馈约定

`skills/team/SKILL.md:82-83` 要求在启动前说明队长工作、成员交付、模型/强度及选择来源；`src/mcp.js:99-113` 支持队长传入 expert/simple 角色，`src/runtime.js:99-112` 将 captain-explicit 和角色写入 attempt。

因此“本次由我显式选择目录中可用的 GPT-6.1 Sol / high……”是宿主队长按 skill 组织的自然语言，不是运行时硬编码的原句。`models.expert` 是模型角色，两个不同 taskId 都可使用同一 expert；只传一个模型角色不会使团队只启动一个成员。源码没有规定必须用 GPT-6.1 Sol/high；模型/强度由有效人类偏好或该次显式选择决定。

### 2. 委派收益门禁只在文字规则中

`PRINCIPLES.md:25-26` 已要求不把唯一阻塞步骤交出去后原地等待。`skills/team/SKILL.md:10-17` 要求独立、可验收、外部证据、结果影响，但队长保留工作只写成 **“Keep an independent part for the captain when useful.”**，未明确要求派发前列出接下来立即执行的独立交付，也未要求对比直接完成与交接成本。

`src/contracts.js:28-41` 没有队长工作、预计收益、能力需求、用户优先回答项或委派原因字段。`src/runtime.js:62-112` 校验模型、target、并发、退出、独占、重试和 dependencies；不检查当前委派是否让队长只剩等待。这属于产品调度缺口，并非运行时误算成员数量。

静态触发反例：只创建一个普通 analysis 合同，含 objective/acceptance/expectedWorkspace，模型和环境有效即可 start；合同不需要陈述队长并行工作。代码无法从这一输入知道队长还有没有独立任务。即使新增原因字段，也只能检查理由完整性，不能机械证明会更快，不应增加一个重复推理的调度模型。

### 3. 队长可以继续工作，但反馈偏向等待

`src/runtime.js:109-112` 将 execute promise 保存在 active 后立即返回；`src/runtime.js:330-337` 只有显式 wait 才等待 done/timeout。`src/contracts.js:13` 的 default=2 是并发上限，不是必须启动两名成员。

`src/status.js:60` 对 running 统一写“等待当前阶段完成”，`src/status.js:65-67` 把阶段执行者标为成员。作为成员执行状态这是事实；作为给队长的下一行动指引，缺少“继续自己负责的独立任务”。`skills/team/SKILL.md:109-113` 的短等待及频繁观察不提供自动唤醒；本次也没有 teams_wait 可证明等待开销。

改进应区分阶段执行者与队长行动，避免把“成员仍在执行”变成“队长现在应该等待”。不要仅修改文案后宣称调度问题已解决。

### 4. 中间发现不会交接成队长可用证据

`src/app-server.js:264-271` 跳过 commentary，记录 tokenUsage/turn completion；`src/app-server.js:291-305` 等 turn 完成才解析 final structured result。`src/actions.js:4` 仅接受 commandExecution/mcpToolCall/dynamicToolCall/fileChange 元数据，不保留业务发现、命令正文和输出。`src/mcp.js:33-42` 通过请求响应返回状态，未实现宿主队长自动唤醒。

因此“页面出现命令动作”和“队长已获得入口/表名证据”是两件事。队长若提前需要成员负责的信息，只能另行读取源码或等最终报告，容易重复探索。建议增加可选、有界的发现摘要，或缩短合同到一个可快速验收的结论；未验收摘要不得解锁依赖或标为 succeeded。自动唤醒是否可行要以宿主真实协议为准。

### 5. 成员不能继承用户想用的 MCP

`src/app-server.js:139-147` 的 memberOverrides 关闭 multi_agent、plugins、apps、hooks、memories、web_search，并将继承的所有 mcp_servers.*.enabled 设为 false；`src/app-server.js:151-159` 在启动线程时应用这些配置。成员不自动取得父聊天连接器能力，fresh thread 也不等于文件系统隔离。

原聊天队长说其工具目录里没有 java-repo-skimmer，后续用源码检索。该记录不能证明这台机器没有安装此 MCP，但当前成员隔离规则确实不会让它们直接使用继承的 MCP。原两合同要求源码证据，未强制成员用该 MCP，故不能把其 shell 检索记为合同违反。

升级应先在计划中明确成员实际能力，再决定是否委派。若后续确需开放特定只读 MCP，应新增显式白名单及真实协议验收；不要直接恢复所有继承插件，也不要假称本轮已经验证 java-repo-skimmer 可用性。

### 6. 宿主中断没有成员取消绑定

`src/mcp.js:179-188` 在 MCP transport 关闭、stdin end、SIGINT/SIGTERM 时 close；`src/runtime.js:497-507` shutdown 才 abort 活跃执行。任务合同没有宿主父轮标识；现有 MCP 入口未订阅宿主轮中断。宿主中断但 MCP 连接仍存活时，成员可继续至报告、显式取消或任务 deadline。

本次观察已确认这种行为；是否应一律自动取消是产品选择，不能把前台临时暂停等同于用户要求停止所有工作。优先明确提示并提供受控停止入口；只有取得可验证的宿主取消事件并确定授权语义后再做自动绑定。不要用任务状态轮询伪装成父聊天心跳。

## 单成员是否值得启动

| 情况 | 决策 |
| --- | --- |
| 唯一工作是查一个方法/解释一条日志，队长已有上下文 | 直接完成 |
| 队长查入口，成员独立查落库，两边有清晰证据合同 | 一名成员可有价值 |
| 一条调用链尚未找到共同锚点，后续都依赖它 | 队长先找到锚点，再判断分工 |
| 成员做全部分析，队长只等待再整理相同内容 | 默认直接完成 |
| 写变更需要独立审查 | 单 reviewer 可有价值，收益是独立质量检查 |
| 成员缺少任务必需的工具，队长有该能力 | 队长处理该范围，先解决能力匹配 |

对于原请求，用户明确要求“优先回答去哪里查入参”。更合适的安排是队长先定位并交付业务入参日志，再沿 AI 调用链推进；若落库范围确实足够独立且值得交接，再派一名成员查实体/Mapper/SQL。不要仅以存在 HTTP/AI/DB 三个标题认定必须分给三名执行者。现有证据没有同条件单 Agent 对照，不能断言这一安排一定更快。

## 建议待办与验收

1. **优先收紧 skill 调度规则。** 普通探索派发前明确队长接下来执行的独立交付、成员产物、最少必要事实及预期收益；没有收益时直接完成。独立审查允许作为质量收益例外。明确 2 是容量而非人数，给出 0/1/2 成员案例。验收：窄查找=0，队长+独立 DB=1，两个独立支线且队长有交付才=2；不为了启用 skill 而启动。
2. **修正状态对队长的行动指引。** 保留真实 nextActor，另明确队长应继续自有任务或按当前合同收结果，避免统一鼓励等待。覆盖 JSON/文字/面板一致性，不能把未知队长工作自动编成进行中。
3. **明确中断后的成员处置。** 先说明前台中断不保证取消、查询真实 active/退出记录；后续研究父轮标识及官方宿主取消事件。验收需要真实宿主中断、连接仍存活、显式取消和最终退出门禁，模拟 shutdown 不能替代宿主事件证明。
4. **缩短发现交接并显式匹配能力。** 首选窄合同；按实际需要增加有界摘要及工具能力说明，不新增后台自主队长。任何 MCP 白名单都单独验证，并保持禁止递归团队及未知外部写入的边界。
5. **再做同条件效率评测。** 固定未知答案的仓库快照、模型、强度、工具、验收深度，对比直接完成/一成员/两成员，记录首个有用答案、总交付、队长重复工作、验收尾部、完整用量与误报漏报。优先验证选择规则，未测不宣称加速百分比。

既有 0.6.1 待办仍包括真实 writer/reviewer 写闭环、其他模型兼容、宿主页面可见性、远程 CI 与同条件交付收益；本次不重做全项目 bug 审计，不把此前已修 schema/增量回执/reviewer 动作问题重复列为新缺陷。

## 验证及交付边界

证据分为三层：宿主聊天观察、插件机器状态回执、队长静态源码核对。没有新成员独立审查，也没有原任务的成功验收；本次不将 running、awaiting_review、自述或工具 exit 0 当成任务成功。

既有受控回归命令 `node --test --test-name-pattern='concurrency, bounded wait and cancellation preserve capacity until exit|real-host regression: MCP override keys are plain dotted paths' tests/core.test.js tests/backend.test.js`：**2/2 pass**，0 fail/cancelled/skipped，duration_ms=166.70425，Node v24.21.0。分别验证并发容量/短 wait/取消等待退出和继承 MCP 关闭配置；使用受控后端及临时状态库，无真实模型推理。没有通过这两项测试宣称测量了速度收益或实现了宿主中断绑定。

报告直接交付主目录，原暂存树 `1d66c24c8d6ca5dc6f6f7f78d1a0efa625442afb` 保持；本轮文档未暂存，无跨 worktree 未同步内容。未 commit/push/update、未启动新模型、未修改 Java 项目或取消原任务。

## 用户强行停止是否连带停止成员（后续核查）

用户进一步确认预期：强行停止自己的任务时，所属成员子进程也应停止。此预期优先于上文“是否一律自动取消仍需产品选择”的历史判断；当前聊天中断后成员继续执行的行为不满足该预期。恢复或暂时暂停应与明确停止分开，不能推定停止后仍允许成员继续。

| 停止入口 | 当前结论 | 证据边界 |
| --- | --- | --- |
| 停止宿主当前聊天轮，MCP连接仍活着 | 没有连带取消成员；原聊天中断后仍有成员动作，最终 awaiting_review | 本次指定真实聊天/插件状态观察 |
| 显式 teams_cancel | 会 abort 当前任务，并等待 backend 清理及退出 | runtime.cancel + 现有受控 backend 回归；没有取消原聊天任务 |
| MCP收到 SIGINT / SIGTERM | 正常进入 shutdown，停止成员进程组 | 本轮实际OS信号 + 受控协议子进程验证 |
| MCP stdin EOF / 正常断连 | 进入 close/shutdown，停止成员进程组 | 本轮stdin EOF验证 + SDK断连既有回归 |
| 对 MCP进程 SIGKILL / 父进程骤死 | 无法保证成员退出，存在 detached 子进程残留 | 本轮受控反例；没有强杀真实Codex或用户进程 |

代码链路：`src/mcp.js:179-188` 捕获连接关闭、stdin end、SIGINT/SIGTERM；`src/runtime.js:500-507` 取消活跃成员/reviewer/验证并等待；`src/app-server.js:310-317` 尝试 turn/interrupt 后进入 stop；`src/app-server.js:114-131` 对进程组先 TERM、300ms后仍存活则 KILL，并检查退出。命令验证也按进程组清理，见 `src/verification.js`。只保证纳入管理且未脱离进程组的子孙；不能据此承诺任意自行脱离组的后台进程全部退出。

`src/app-server.js:31` 使用 detached:true，让成员拥有独立进程组，便于显式整组清理。代价是父MCP进程突然死亡时不能依赖同组信号连带结束；SIGKILL不可捕获，现有shutdown无机会执行。应用本身可能因stdio EOF自行退出，但当前代码没有父死亡监护或强制退出保证。

本轮临时实验使用当前源码的真实 TaskRuntime/TaskStore/serve/CodexBackend/AppServerClient，成员为受控 fake App Server 的 hang 模式，额外添加存活timer以模拟不因stdin EOF自行结束的合法子进程；父进程通过IPC报告成员PID及turn就绪后，分别施加四种停止入口。SIGINT/SIGTERM/stdin-end 三项均 parentExited=true、memberGroupAlive=false；SIGKILL 为 parentExited=true、memberGroupAlive=true。实验随后手动清理该受控组并确认退出，临时状态库/脚本已删除。无真实模型、网络推理、用户任务取消或正式配置修改。该反例证明父骤死清理保障不足，不声称真实Codex每次SIGKILL都一定残留。

既有定向回归：`node --test --test-name-pattern='abort interrupts and reaps a hanging member|TERM send failure still escalates to KILL|stdio serve routes without a fallback runtime|runtime shutdown cancels verification|timeout escalates to SIGKILL|descendants keeping pipes open' tests/backend.test.js tests/mcp-routing.test.js tests/verification.test.js`：**6/6 pass**，0 fail/cancelled/skipped，duration_ms=1581.606625。验证取消清理、TERM故障升级、MCP SDK断连、验证shutdown、忽略TERM和子孙持有管道场景。不能将这些回归称为已实现宿主停止按钮联动。

下一步按用户预期，应优先补“当前宿主任务停止→只取消其所属attempt→确认成员/reviewer/验证进程退出”的绑定；当前合同没有宿主轮归属、连接还可管理多个项目，不能简单停止整个MCP而影响其他任务。须先核实宿主能提供的官方停止事件，没有该事件时明确说明能力限制。父骤死另需独立存活的有界监护/父存活检查或平台支持；仅给现有父进程再加signal handler或去掉detached无法解决SIGKILL。两项本轮均未实现，不将测试通过记作问题已修复。
