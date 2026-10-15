# 0.6.3 当前代码复查与升级顺序

日期：2026-10-15（Asia/Shanghai）。依据 PRINCIPLES.md 的准确性、完成效率与最小改动原则。对象为主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams` 当前工作树，main，HEAD `25e15c7`，源码版本 0.6.3，包含既有暂存改动；不是仅审查 HEAD。本轮不修改运行代码。

结论：本轮范围内确认两项尚未修补的 P2，没有确认 P0/P1。H1/H2/U1 已有修补，不重复列为当前 bug。全量绿测不覆盖下面两个反例。升级先补入口一致性与更新校验，再做真实宿主验收与同条件效率测量；不立即扩展并行写或后台调度。

## B1：省略 workspace 的跨项目调用被 hook 拒绝（P2）

- 位置：`src/host-hook.js:22` 使用 `args.workspace ?? input.cwd`，`:24` 读取该目录端点，`:33` 将其作为显式 workspace 发给 bind；`src/host-lifecycle.js:80` 路由，`src/workspace-router.js:76` 拒绝不匹配项目。
- 触发：同一 MCP 连接已知 A、B 两个项目，聊天 cwd=A，任务属于 B；`teams_start` 或 `teams_integrate` 只传已知 taskId，省略 workspace。
- 预期：按公开合同和可选参数 schema，已知 taskId 应解析到 B。`src/mcp.js:33` 与 skill 均允许连接内已知 taskId 省略 workspace。
- 实际：hook 把聊天 cwd=A 当成明确目标。A 有端点时 bind 报 `belongs to another workspace`；A 无端点时更早读取失败。合法调用在 MCP handler 前被拒绝。
- 影响：跨项目派发/集成受阻；归属门禁仍阻止错项目执行，没有证据表明会启动到 A。同目录调用及显式传 B 的调用可正常通过。
- 临时办法：这两个工具始终显式传任务 `target.root`。
- 最小修补方向：统一 hook 和公开工具合同。若保留 taskId-only，hook 需沿受控连接解析已知任务归属，不能将 cwd 作为显式覆盖；若选择要求这两个入口显式 workspace，应同步 schema、说明、skill 和示例，不能只改报错文案。
- 验收：真实 hook + lifecycle + router 的双项目组合用例，覆盖 start/integrate、同目录、省略/显式目标、错误目标和重连；保持中断归属及未知任务拒绝规则。

成员以静态调用链和纯内存反例提出。队长独立运行当前 `WorkspaceRouter`、`startHostLifecycle`、`handleHostHook`，仅用受控 runtime/任务快照，创建临时双项目、真实 Unix socket 和 hook registry。直接 taskId-only 路由到 B；两个 hook 入口均如下：

```json
{"tool":"start","taskIdOnlyResolvesToB":true,"hookWithoutWorkspace":"Task task-b belongs to another workspace; use its actual workspace","hookWithWorkspace":"allow"}
{"tool":"integrate","taskIdOnlyResolvesToB":true,"hookWithoutWorkspace":"Task task-b belongs to another workspace; use its actual workspace","hookWithWorkspace":"allow"}
```

最小复现步骤：创建临时 A/B 目录及各自 `.codex-teams`；通过 `WorkspaceRouter` 注册两项目、仅让 B 的 observe 返回 task-b；启动 lifecycle 并为两个 scope publish；断言 `router.resolve({taskId:'task-b'}).workspace` 为 B；调用 `handleHostHook`，输入 `cwd:A`、`tool_input:{taskId:'task-b'}` 以及上述两个工具名；断言拒绝。再加入 `workspace:B`，断言 allow。最后关闭 lifecycle/router、删除临时目录和本次 registry。

队长脚本 `/tmp/teams-audit-hook-20261015.mjs`，最终 exit 0。首轮 fixture 直接比较 macOS `/tmp` 和 `/private/tmp` 路径，出现 Unknown task；将临时根目录 realpath 归一化后通过，未改生产源码。该验证未实际启动模型、应用补丁或点击桌面按钮。

## B2：更新成功校验遗漏启动文件和运行配置（P2）

- 位置：`scripts/update.js:104` 比较 build-info 元数据，`:108` 的实际文件清单只含 src、skill、package、兼容 manifest 和 hooks，遗漏 `mcp-launch.js`、`mcp-launch`、`.mcp.json`、`mcp.json`、`teams.config.json`。
- 触发：候选包正常，但实际安装缓存中的上述入口/配置与候选不同，版本、sourceDigest 元数据及当前检查清单仍相同。
- 预期：更新检测出实际缓存的启动关键文件不一致并进入既有恢复流程。
- 实际：成功返回 installedPath/version/sourceDigest；CLI main 会据此输出“更新完成”。后续 MCP 可能无法启动，或使用不同配置。
- 证据边界：队长分别把临时缓存中的 `mcp-launch.js`、`.mcp.json`、`teams.config.json` 改成无效文本，实际调用当前 `installPreparedPlugin`，三次均返回成功。没有证明正式官方安装会发生这类损坏。其余两个遗漏文件由清单静态确认。
- 最小修补方向：成功路径也逐文件比较所有启动关键文件，并检查需要执行的 shell launcher 权限。复用明确的关键文件清单，避免成功校验与回退校验再次分叉。无需把运行依赖全部纳入本轮哈希。
- 验收：对三个已复现文件分别做“修改/缺失”用例，必须拒绝成功并验证恢复；保留正常首次安装、替换、legacy 回退与同版本漂移回归。未逐文件核对运行依赖的边界继续如实说明。

受控复现输出：

```json
{"file":"mcp-launch.js","returnedSuccess":true,"actual":"BROKEN-CACHE-CONTENT","version":"0.6.3"}
{"file":".mcp.json","returnedSuccess":true,"actual":"BROKEN-CACHE-CONTENT","version":"0.6.3"}
{"file":"teams.config.json","returnedSuccess":true,"actual":"BROKEN-CACHE-CONTENT","version":"0.6.3"}
```

最小复现步骤：按 `tests/update.test.js` 的隔离模式，调用 `packPlugin` 生成临时候选并复制到临时 cache；改写目标文件；注入仅维护内存 marketplace 状态的 command，plugin add 返回该 cache，list 在首次安装前返回空安装；调用 `installPreparedPlugin`，workspace 指向无状态库的临时目录；观察返回成功且文件仍无效。不得用正式配置或真实安装执行此破坏。

队长脚本 `/tmp/teams-audit-update-20261015.mjs`，exit 0；真实文件复制/比较、受控 CLI 返回，无正式安装/模型调用。临时候选与缓存均已清理。脚本和日志在 /tmp，仅为本机辅助证据，不是仓库持久测试。

## 版本与历史问题校正

- 本轮 `teams_status(overview:true)` 于 `2026-10-15T02:37:06.733Z` 返回 viewer/runtime 均为 **0.6.3**，实际来源为 `/Users/anshunli1/.codex/plugins/cache/codex-agent-teams-local/codex-agent-teams/0.6.3/`，build digest `571dba09c9f00c0e7b484238614533f292e4ef68f6a18bcf2215a2aad32eb62b`。旧 STATUS 的“仍 0.6.2”是历史时点。本轮未执行 update，也未逐文件审计正式缓存。
- H1：按自身 token/socket 删除端点，缺失可补发，生产关闭先撤销端点。H2：pending 与 bindings 分离，接受成功后提交归属。U1：回退核对旧缓存关键文件身份。这三项已有代码与回归，B1/B2 是不同边界。
- 只读并发、带 executionPlan 独占、未知进程身份保守拒绝、ignored 依赖不纳入输入指纹和进程主动脱组边界是已记录设计限制，不计为新 bug。
- 根升级方案和 STATUS 保留大量历史段落；当前结论应指向本报告，不再从旧“下一步”推导待办。CLI 进度、逐任务 model/effort、队长显式模型、增量观察和精简 review 回执均已有实现。

## 建议实施顺序与验收

| 顺序 | 交付 | 完成标准 |
| --- | --- | --- |
| 1 | 小补丁修 B1/B2 | 两个反例被覆盖，既有回归保持通过，不扩大权限或增加依赖 |
| 2 | 当前版本真实宿主验收 | 桌面停止分别覆盖 member/reviewer/验证与 discovery 等待，核对所属轮次和真实退出；再跑 writer→验证→独立 reviewer→队长复核→显式集成→源复验，核对原 HEAD/index |
| 3 | 当前离线平台矩阵 | 现有 `.github/workflows/ci.yml` 已定义 macOS/Linux × Node 24.0.0/24.x；应补当前版本运行证据，不重新造 CI |
| 4 | 小规模同条件效率测量 | 同任务/基线/验收比较单强模型、原生子 Agent、插件，记录正确率、严重错误、总耗时、返工、人工介入和协调开销；无数据不声称加速 |
| 5 | 数据支持后的体验/并行能力 | 有界发现摘要优先衡量能否减少重复探索；工具白名单仅针对真实工具缺口；并行写需定义源变化后的重新验证/审查，不能仅删除独占门禁 |

第2、4项为后续独立验收工作，本轮未运行真实写模型或付费对照长跑。保留前台反馈和状态页，不新增后台队长。

## 本轮证据与交付

- 队长 `npm test`：312/312，0 fail/cancelled/skipped，101436.099584ms，Node v24.21.0/macOS；日志 `/tmp/teams-audit-20261015-tests.log`。自动化/受控协议/真实本机命令通过，不代表真实模型写效果。
- 独立审查：Agent Teams MCP，GPT-6.1 Sol `krill/gpt-6.1-sol/high`，captain-explicit，一名只读成员。task `792a91b8-951d-478d-b953-39366efe94cf`，attempt `34b0cea6-982d-468c-85c0-e0ba9dc19495`，193.938秒，memberLaunch=exited、cleanupConfirmed=true。成员提出 B1；队长独立复现并核对两条原验收后 review(pass)，终态 succeeded，仅代表报告验收，不代表缺陷修复。B2 为队长独立发现和复现，未交该成员审查。
- host 成员累计 totalTokens=528706，inputTokens=521562，其中 cachedInputTokens=439552，outputTokens=7144；缓存已含输入，不重复相加。不是一次提示长度；缺少主线程与对照，不推算费用或收益。
- 仅交付审查/状态/计划文档；源码、测试、版本与正式配置不改。既有暂存树 `c6e7b068a73edc1313595a53c7872413f0bf172f` 保持，本轮文档未暂存，未 commit/push/update，无跨 worktree 待同步内容。文档完成后做 diff 格式、链接与暂存树核对。

## 本次真实使用复盘与页面13条记录（2026-10-15续问）

用户截图的“展示13/13个任务”是项目累计任务视图，不是本轮创建13个任务。`teams_status(overview:true,limit:20)` 于 `2026-10-15T02:51:08.915Z` 返回 total=13、running=0、awaiting=0、succeeded=10、attention=3、pending=0。本轮仅创建 `792a91b8` 一个任务，其余12条为历史任务；历史记录中可见2026-10-12、2026-10-14的不同版本审查。失败/受阻旧记录不会因代码修复自动变成功，也不证明当前仍有相同bug或活成员。

截图两条cache路径是查看工具和运行时实际安装来源，均为0.6.3，不是两份任务缓存。任务累计数据由项目`.codex-teams/state.sqlite`保存；模型cachedInputTokens则是另一种输入用量统计。仅凭此截图不能判断旧安装包、worktree或日志是否无用，本轮没有扫描/删除这些内容。

产品体验问题：`src/status.js:157`的overview对snapshot.tasks全项目计数，`:243`页面标题为“任务总数”，没有“项目累计”提示、会话筛选或历史归档。新任务attempt虽有host session/turn，taskView和页面未用它区分本聊天。建议先明确累计口径并支持本会话视图/历史折叠，保留全项目入口；旧记录缺归属时显示“历史/归属未知”，不能猜成本会话。历史失败/受阻应能标记已处理/归档并保留原始终态，避免永久“需关注”噪声；删除数据库不是合适的显示层修法。此为产品改进，不追加成P0/P1或执行正确性缺陷。

本轮委派确有质量收益：一名成员在队长检查更新分支期间发现B1，并由队长独立复现验收；不存在启动13个成员或只等待成员的情况。但没有同条件对照，不能证明更快。成员193.938秒，报告到队长验收约52.217秒，完整文档交付另有开销。

队长使用问题也应改进：首次把多份长历史文档拼在一次读取中，输出被截断；后续又较宽读取历史与测试，增加了无关上下文。观察虽使用了增量游标，确认版本时的overview仍带出长任务详情；本次列13条又出现输出截断，说明需要更小的项目摘要/任务目录返回。这是队长读取策略与工具返回粒度共同的问题。下一轮应先读最新状态和必要函数，按发现补读；分离版本/计数/任务目录与详细证据，避免每次overview返回动作、长报告等内容。最终报告也可用短结论加证据附件降低交接阅读负担。

本续问没有启动新成员、执行模型请求、修改运行代码或清理历史数据；只读MCP观察后补本文与STATUS，原暂存区保持。
