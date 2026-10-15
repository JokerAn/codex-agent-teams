# Codex Agent Teams

准确率与完成效率优先，成本其次。一个小型、本机运行的 Codex 插件，用于可验收的代码委派。

**0.6.1 补齐严格输出 schema 与发送前检查、请求拒绝指引和动作角色摘要；队长指定模型，真人选择可选**。插件不再绑定构建时的项目，队长从当前聊天上下文自动填入目标目录，用户无需逐项目配置或重新打包。任务仍按合同 → 独立 worktree 修改 → 命令验证 → 全新强模型线程审查 → 队长复核 → 显式集成 → 源工作区再次验证执行。不会自动提交或推送。

0.2.1 补齐失败重试的执行信息归属、只读成员与 reviewer 的实际目录校验，以及协议致命错误后的缓冲释放；新增 macOS/Linux 离线 CI。

设计依据：[PRINCIPLES.md](PRINCIPLES.md)。验证记录：[docs/STATUS.md](docs/STATUS.md)。项目使用 Node.js 24+、原生 ESM、内置 SQLite、官方 MCP SDK 与 Zod，没有编译步骤、前端或后台协调者。

0.3.0 新增真实模型列表与用户确认表单，简单任务可使用已确认的轻量模型；0.2.3 修复双重失败时清理异常覆盖执行错误，以及集成恢复覆盖已有执行结束时间的问题。恢复观察时间单独记录；结束时间无证据时保持未知。

## 快速开始

安装插件只需在项目根目录运行（支持 macOS/Linux，需要 Node.js 24+ 和已登录的 Codex CLI；macOS 支持自动查找标准位置的 Codex/ChatGPT 桌面应用内置 CLI；Windows 在构建/打包入口提前拒绝）：

```sh
npm run build
```

build 优先使用配置/显式参数和 PATH；默认命令 `codex` 不在 PATH 时，macOS 会检查 `/Applications` 和 `~/Applications` 下的标准桌面应用位置。找到后打印绝对路径并保存到包内配置，已有 `teams.local.json` 不被改写；找不到时在安装依赖前报错。自定义安装位置可用 `npm run build -- --binary /完整路径/codex` 指定。显式配置的无效路径不会被自动替换。

该命令自动执行 `npm ci --ignore-scripts`；首次使用 Codex 有效配置模型（未配置时取目录默认项，要求支持 high）生成不含固定 workspace 的 `teams.local.json`，已有本机文件保持原样。默认模型必须支持 high，否则明确失败，不改选其他模型。随后生成包含生产依赖的本机插件包，并检查实际宿主的插件发现、模型和只读线程权限，不启动模型推理。

完成后终端会打印「添加插件市场」的来源绝对路径，Git 引用和稀疏路径留空；添加市场后安装 `codex-agent-teams`。重复构建会生成新目录并保留旧包，已安装插件需要重装更新缓存。命令不会自动修改 Codex 插件配置。构建依赖可联网安装，宿主检查需要本机 Codex 可用。

本机包保存 Node/Codex 的绝对可执行路径，打包时检查 Codex 可执行文件存在。现代 MCP 配置使用插件内 `./mcp-launch` 脚本调用固定 Node，符合宿主的命令路径限制；兼容配置直接使用固定 Node。启动继承宿主当前 PATH 并加入该 Node 目录，供 `env node` 脚本和验证命令使用，不再保存构建终端完整 PATH。自定义验证程序须在宿主 PATH 可见；启动前检查会明确拒绝缺失依赖。两个 manifest 遵循各自官方格式，仅共有元数据保持一致。

换项目无需修改配置或重新构建。更改通用设置或升级版本时才生成新包；也支持 `npm run build -- --config /path/to/config.json --out /path/to/new-marketplace`（或 `TEAMS_CONFIG`）。显式配置必须已存在，输出目录必须尚不存在。旧配置即使包含 workspace，新包也会移除该字段；原文件不改写。

以下为开发与手动配置入口：

需要可用的 Codex CLI 和模型账号。本机实测 Node `24.21.0`、macOS arm64、Codex `0.147.0-alpha.6.5`；其他版本先运行 doctor。

```sh
npm ci
npm test
node src/cli.js doctor
```

复制 `examples/teams.config.json` 为 `teams.local.json`，填写 Codex 可执行文件和初始 expert 模型，跨项目配置不填 workspace。不要提交这个本机配置。带路径的 codexBin 以配置文件目录为基准，普通命令名从 PATH 查找。旧的直接 CLI/手工 MCP 配置若包含 workspace，仍锁定该项目；需要跨项目使用时移除该字段。

```sh
node src/cli.js doctor --config ./teams.local.json --check-thread
```

doctor 只做握手、模型/推理强度与可选只读线程权限检查，不启动推理。写成员的权限另外按本机协议核对。任务执行会使用账号模型额度；`npm test` 不调用模型。

## 接入 Codex

```sh
node src/cli.js pack --config ./teams.local.json --out ./dist/marketplace-v0.6.1
node src/cli.js doctor --plugin ./dist/marketplace-v0.6.1 --check-thread
```

pack 生成本机 marketplace：包含 skill、MCP、源代码、配置快照和锁定的生产依赖，不包含测试或运行数据。需要先 npm ci；拒绝覆盖已有输出。插件根目录的相对路径可随宿主缓存搬迁，Node/Codex 仍依赖本机安装。

以下两条由用户明确选择执行，会修改宿主插件配置：

```sh
codex plugin marketplace add /absolute/path/to/dist/marketplace-v0.6.1
codex plugin add codex-agent-teams@codex-agent-teams-local
```

在新聊天中使用 `codex-agent-teams:team` skill，确认八个 teams_* 工具可用。项目不会自动安装到用户配置；已验证临时 CODEX_HOME 中真实安装、缓存启动、工具注入和调用，桌面 UI 安装未代操作。宿主缓存不自动跟随源码更新；版本/配置更新后生成新包并刷新或重新安装。

也可按 `examples/mcp.config.toml` 手工配置 MCP：

```sh
node src/cli.js mcp --config /absolute/path/to/teams.local.json
```

每个目标工作区同时只允许一个实际运行时；插件与手工 MCP 选一种，避免两个运行时争抢状态库；只读状态观察可以并存。握手和工具清单连接不会获取 owner。关闭 MCP 会取消活跃成员/命令，成员不会自动唤醒已结束的父聊天。

日常使用只需在当前项目聊天中要求“用 Team 处理这个任务”。队长自动调用 `teams_models({workspace: cwd})` 和 `teams_create({expectedWorkspace: cwd, ...})`，其中 cwd 来自聊天上下文。后续已知任务 ID 自动路由到其项目；重连时由队长补 workspace，多项目列表明确目标。项目状态与模型偏好分别保存在各项目的 `.codex-teams/`，不能串用。MCP 缓存目录不会被当成项目，缺少可确定的目标时会要求队长补上下文。

| 工具 | 用途 |
|---|---|
| teams_create | 必填 expectedWorkspace，核对目标后固定合同、依赖与验收条件；不调用模型 |
| teams_models | 读取实际模型列表与目标；confirm=true 请求用户表单，可选记住；forget=true 撤销，无推理 |
| teams_start | 用户确认模型分工后启动成员；可选工作区/验证计划；失败重试须明确理由，统一 expert，最多三次 |
| teams_status | 只读状态、attempt 与证据；overview 显示版本、阶段、耗时及验收摘要 |
| teams_wait | 最多等待 30 秒，超时不取消 |
| teams_review | 队长逐项复核指定 attempt，返回精简回执；完整报告/复核证据用 status(verbose=true) 查询；写任务通过后仍等待显式集成 |
| teams_integrate | 应用已复核补丁并验证源工作区；不提交、不推送 |
| teams_cancel | 取消并等待退出；可显式 cleanup/discard 清理最新目录，保留记录和日志 |

## 看见插件是否工作

0.2.2 新增运行反馈与只读状态页。新安装的 team 技能在调用时查询状态，在实际启动成员后显示“Agent Teams 已启动”、任务编号、模型和分工；结束时显示验收结果、耗时与证据。没有委派时也明确说明本次由主 Agent 处理。聊天反馈由前台 Codex 执行技能约定，运行时不会后台唤醒已结束的聊天。

在聊天中说“查看 Agent Teams 状态”，新版技能使用 `teams_status({overview: true, limit: 10})` 返回查看工具版本/来源、记录的 owner 版本/来源、阶段、用量及验证摘要。没有任务记录、等待队长复核、等待集成和已完成分别展示。旧缓存不支持 overview 时保留原查询能力，并明确未知信息。源码升级不会自动更新宿主缓存，需按下节重装后才能使用新版技能与接口。

也可以在 MCP 正在运行时，从终端查看同一工作区，不争抢 owner、不恢复旧任务、不调用模型：

```sh
node src/cli.js status --config ./teams.local.json --human
node src/cli.js status --config ./teams.local.json --overview --limit 20
node src/cli.js status --config ./teams.local.json --html ./.codex-teams/teams-status.html
```

最后一条生成可直接打开的本地 HTML 状态页，支持搜索、状态筛选和展开阶段/结果/证据。输出文件须为新的 `.html` 文件，存在时拒绝覆盖；再次导出请使用新文件名。页面明确标示快照时间，刷新浏览器不会重新读数据库；新记录需重新导出。默认展示执行中、待验收优先的最近 20 项，可用 `--limit` 指定 1–100；计数包含全部记录。

“查看工具版本”来自执行这条查询的源码或缓存包，“运行时版本”来自持有工作区的 owner 记录，两者可能不同。旧 owner 没记录版本/来源时显示未知，不能把源码版本当成已经安装的版本。owner PID 存在只代表进程存在，不证明任务在推进。 若有执行中记录却未检测到 owner，页面会提示先检查旧成员进程与记录，禁止盲目重派；缺少结束时间的已停止任务保持耗时未知。新包的 `build-info.json` 包含版本、打包时间和源码/技能摘要，不包含本机配置内容。

状态页只在本机展示任务目标、摘要、用量和证据路径；没有远程服务、常驻网页进程或自动操作按钮。旧阶段和未知用量保持未知。原 JSON 单任务详情与紧凑任务列表继续可用。

## 升级代码后重装插件

在项目根目录的一般终端执行：

```sh
npm run update
```

无需先执行 `npm run build`。`update` 会安装锁定依赖、构建新包、检查模型与只读线程权限，再通过官方 Codex CLI 切换本地 marketplace 来源、重装插件，并核对实际缓存版本、源码摘要及文件内容。首次安装也可使用。该命令会修改当前 Codex 用户配置和插件缓存；`build` 继续只打包，不执行安装。检查不启动模型推理，也不代替开发时的完整测试。

执行前结束所有项目的 Team 任务并关闭对应会话；命令会检查本项目的 owner、未完成交接和退出记录，无法扫描其他项目。构建/检查失败时不触碰安装；替换失败时尝试恢复原来源和安装状态，恢复未完成会明确报错。新旧包均保留，项目任务数据不删除。完成后重启 Codex 并开启新聊天，让新的 skill/MCP 生效。

需要指定配置、CLI 或输出目录时：

```sh
npm run update -- --config ./teams.local.json --binary /完整路径/codex --out ./dist/marketplace-v0.7.0-custom
```

输出目录必须尚不存在；默认自动生成唯一新目录。现有同名 marketplace 是非本地来源、包含其他已安装插件或目标插件已禁用时，命令会要求先手动核对，不覆盖这些状态。

以下是分步操作入口。当前通过本地 marketplace 安装，宿主使用插件缓存副本；仅修改 `src/` 不会更新已安装副本。

以下以当前 **0.7.0** 为例。后续升级时替换为新版本号，并选择尚不存在的输出目录。准备包和正式安装分别验收；源码或新包出现不会热替换已加载的旧 MCP 连接。

1. 更新源码并同步版本号：`package.json`、`package-lock.json` 的顶层与根包版本、`plugin.json`、`.codex-plugin/plugin.json`。MCP 与 App Server 的版本元数据直接读取 `package.json`；pack 会检查包与两个插件 manifest 的版本一致。
2. 在项目根目录先验证并生成新包。输出目录必须尚不存在；保留旧包，便于需要时恢复。

```sh
npm ci
npm test

node src/cli.js pack \
  --config ./teams.local.json \
  --out ./dist/marketplace-v0.7.0

node src/cli.js doctor \
  --plugin ./dist/marketplace-v0.7.0 \
  --check-thread
```

3. 新包检查通过后，等现有团队任务结束或明确取消并确认退出，关闭使用旧插件的 Codex 会话。在项目根目录的独立终端切换安装：

```sh
# 卸载旧插件，清除它的安装配置和缓存
codex plugin remove codex-agent-teams@codex-agent-teams-local

# 新包目录变了，切换同名 marketplace 的来源
codex plugin marketplace remove codex-agent-teams-local
codex plugin marketplace add ./dist/marketplace-v0.7.0

# 安装新插件
codex plugin add codex-agent-teams@codex-agent-teams-local
```

4. 重启 Codex 并开启新聊天，确认 `codex-agent-teams:team` skill 和八个 `teams_*` 工具可用。安装结果应显示预期版本。若第一次接入、尚未安装旧版，则直接添加新 marketplace 并安装，跳过 remove。

卸载插件清理宿主的安装配置和插件缓存，不删除目标工作区 `.codex-teams/` 中的任务、worktree 或日志。不要为了升级手工删除运行数据。切换 marketplace 必须指向新包目录，否则可能重新安装旧包。

本机 `codex plugin marketplace upgrade` 用于刷新 **Git marketplace** 快照，不适用于这里的本地目录换包流程。本地来源切换与 0.2.0 → 0.2.1 重装已在临时 `CODEX_HOME` 中实际验证；没有操作用户正式配置。

如果使用的是手工 MCP 配置，源码入口直接指向本地项目，则无需卸载插件：更新源码和依赖、验证后重启对应 Codex/MCP 进程即可。

## 只读与写任务

普通只读合同见 `examples/read-only-task.json`；可选独立 worktree 与验收命令见 `examples/verified-read-only-task.json`。

```sh
node src/cli.js run --config ./teams.local.json --task ./examples/read-only-task.json
```

返回 awaiting_review 是预期，成员不能自我验收。写任务先按 `examples/write-task.json` 替换实际目标、验收标准、allowedPaths 和命令。必须设置 mode=workspace-write 和 executionPlan；默认 auto 按已确认分工选择，指定 expert 可强制高级模型。

```sh
node src/cli.js run --config ./teams.local.json --task ./my-task.json
node src/cli.js status --config ./teams.local.json --id '<taskId>'
node src/cli.js review --config ./teams.local.json --spec ./.codex-teams/review.json
# 拒绝/失败后，用已有任务重试：start --id '<taskId>' --retry --reason '新的证据或修复理由'
node src/cli.js integrate --config ./teams.local.json --id '<taskId>' --attempt '<attemptId>'
```

将 review.json 放在 `.codex-teams/` 等不参与基线的目录，避免新增审查文件改变源指纹。它使用真实 taskId/attemptId，按原顺序对每项 criterion 提供原始证据，例如：

```json
{
  "taskId": "从状态中取得",
  "attemptId": "当前 attempt 的 id",
  "verdict": "pass",
  "evidence": [{"criterion": "原验收条目，逐字复制", "evidence": "已检查的文件、行为和验证日志"}]
}
```

只读任务复核后 succeeded；写任务复核后 awaiting_integration，显式集成后的命令通过才 succeeded、解锁依赖。机器验证和独立 expert 审查不替代队长证据复核。

源工作区必须仍与捕获时一致，包括已有未提交改动与 index。源变化或应用冲突直接拒绝，不覆盖用户改动，不自动解决冲突。snapshot 可显式把现有暂存/未暂存最终内容作为基线；集成只应用本次 patch，不暂存也不修改 HEAD。集成验证失败或中断时保留已应用内容并记 integration_failed，不能重放；检查源文件和日志后再明确规划修复。

## 工作区、验证与边界

0.6.2 的本机插件带有 `PreToolUse`、`Interrupt` 和 `SessionEnd` hooks。安装后必须在宿主中启用 hooks 并审查、信任这组定义；安装本身不会代替信任。启动和集成前，hook 将真实宿主 session/turn 绑定到任务，注入一次性 `hostTicket`；这是内部字段，不由队长编造。缺少有效绑定时拒绝启动/集成，避免退回无法跟随聊天停止的运行方式。目标项目与聊天 cwd 不同时，start/integrate 要显式带 workspace。

本机 `0.162.0-alpha.17.2` 的实际协议对照发现：根 portable `plugin.json` 会遮蔽兼容 manifest 的 hooks，返回空定义。因此本机包只交付官方 `.codex-plugin/plugin.json` 入口，避免静默丢失停止联动；仓库 portable 定义仍维护。后续恢复 portable 产物前必须重新验证真实 hook 发现，不能仅看线上文档或schema。

中断活跃聊天轮时，只取消该轮绑定的工作；会话结束时取消该会话绑定的工作。中断标记先于取消写入，防止模型发现结束后迟到启动，旧轮事件不能取消新轮重试。取消会等待成员、reviewer 和验证退出；超过 hook 时限或退出未知时提示检查状态，禁止直接重派。集成已经写入源的改动保持现场。

MCP 重连后，status/models 仍然只读，不会自动创建 owner。继续已有任务前先调用 `teams_wait({workspace, taskId, timeoutMs: 0})` 初始化该项目 owner 和控制端点，再执行 start/integrate；旧进程退出未确认时先排查，不重复建任务绕过。控制端点不可达只代表连接失效，停止 hook 会提示“退出未确认”，不会据此宣称成员已退出。

成员和验证命令各由短生命周期进程守护，使用独立控制管道检测运行时死亡。即使 MCP 收到 SIGKILL，守护也会清理其管理的进程组；没有后台自主队长或模型调用。该保障限于受管理进程组，不涵盖自行脱离组的进程、同时强杀守护或系统故障。直接 CLI 的 run/start/integrate 仍使用显式取消和进程信号；打包插件自动启用 `--host-lifecycle`，不要删除该参数绕过门禁。

委派普通探索前，应明确队长立即执行的独立交付及成员产物；队长只剩等待、转述或重复探索时直接处理。默认并发 2 是容量，不要求两名成员。独立审查可因质量收益使用一名成员。成员不继承父线程的 MCP/插件，所需工具不可用时应调整分工。

工作区使用 `.codex-teams/worktrees/<id>`；证据保存在 `.codex-teams/`，将这个目录加入目标仓库自己的忽略文件。原 index/文件不会因基线捕获被 stash 或覆盖。用以下命令查看和清理：

```sh
node src/cli.js workspace list --config ./teams.local.json
node src/cli.js workspace inspect --config ./teams.local.json --id '<workspaceId>'
node src/cli.js workspace remove --config ./teams.local.json --id '<workspaceId>' --discard
```

MCP 连接仍持有 owner 时，调用 `teams_cancel({taskId, cleanup: true, discard: true})` 清理最新目录；成功任务保持 succeeded。不要同时启动 CLI 去抢同一状态库。

`--discard` 明确丢弃该 worktree 的内容；不影响已集成到源的文件。默认 remove 只删除干净 worktree，当前 running/awaiting_review/awaiting_integration 目录要先完成复核/集成或取消。退出未确认时禁止重派/清理，崩溃恢复不自动重放或误杀旧 PID。

[WORKSPACES.md](docs/WORKSPACES.md) 说明手工 prepare/verify、限额和支持的 Git 形态。当前基线拒绝 submodule、sparse、unmerged、外部 filter、越界 symlink；不复制忽略依赖或自动安装。命令为显式授权的本机程序，command+args 不隐式拼接 shell，日志合计默认 2 MiB，输出超限不会通过。

写成员请求并核对 worktree 写沙箱、网络关闭、临时目录排除和禁止提权。allowedPaths 是路径审计与交付门禁，不是逐文件系统调用权限；宿主写沙箱限制工作区。独立审查为只读。worktree 共用 Git 对象且不是文件系统虚拟机，实际限制依赖宿主/OS；后台程序主动创建新 session 的完整治理、PID 复用和所有平台矩阵仍有限制。

每个项目内，带工作区/写计划的任务当前串行，普通只读默认并发 2、最多 4。启动时由队长显式指定模型分工，或复用重新校验有效的真人偏好；auto 只把明确 simple 的非审查任务交给所选 simple，其他任务使用 expert。简单写任务仍经过 expert 独立审查，重试也固定本次 expert。旧 qualified 路由要求评测依据；不按价格自动降级，不声称未经对照评测的节省比例。

## 实时查看成员进度

首次启动成员后，队长调用 `teams_status({workspace: target, panel:true, taskIds: [taskId]})`，取得本项目实时状态页 URL；宿主支持时打开到 Codex 右侧浏览器面板，否则在聊天提供链接。插件不会自动打开外部浏览器，也不能将 App Server 成员挂到 Codex 原生子 Agent 面板。旧缓存没有 panel 参数时需按上面的升级流程重装并重开会话，源码修改不会更新正在运行的插件。

页面明确区分“本次选定任务”和“项目累计任务”；taskIds是队长显式选择的集合，不代表自动识别当前聊天。可切换到项目全部，默认收起项目历史终态；展开不会改写原终态或删除证据。搜索覆盖当前范围全部记录，再按limit展示（最多100条），超过上限会明确提示。

常规版本与计数查询优先用 `teams_status({workspace: target, overview:true, projection:"summary"})`；任务目录用 `projection:"catalog"`，按taskId再取报告。省略projection仍返回原完整overview。taskIds仅用于panel，投影仅用于无taskId的overview；两者不与verbose或增量观察混用。

页面每 2 秒读取阶段、任务、模型、耗时、最近记录、下一步及验证证据，并保留筛选和展开状态。读取失败明确显示上次记录，owner 缺失时耗时保持未知；没有新记录或耗时增长不代表模型正在推进。队长前台等待每次最多 10 秒，并至少每 30 秒报告一次观察，阶段变化及时反馈。

状态服务只绑定 `127.0.0.1` 的随机端口和随机访问路径，按项目、选定集合与连接复用，MCP 连接关闭时退出。它不取得任务 owner、不写状态、不派发/取消任务，不提供模型思维流或队长后台唤醒。原 `status --html` 仍是离线快照。

## 0.7.0 调用迁移

启用hooks的官方路由MCP中，`teams_start`与`teams_integrate`现在要求显式绝对路径`workspace`。队长从任务`target.root`填入，跨项目任务不能用聊天cwd代替；用户无需重复输入路径。hook与SDK schema均在推理/集成前拒绝缺失目标。已知taskId的status/wait/review/cancel继续允许省略workspace；无hooks CLI和直接legacy MCP保持原入口合同。升级后重开连接以刷新工具schema。

更新命令的成功与回退均核对启动关键文件的实际内容、文件类型和launcher执行位；未逐文件核对运行依赖的边界保持。页面任务历史、安装来源cache、模型cached input为不同概念，项目累计任务数不代表本轮成员数，也不是磁盘清理依据。

## 模型发现、用户确认与任务路由

在已更新插件的新会话中，先调用 `teams_models` 查看宿主实际 `model/list` 列表和 `config/read` 中的模型/推理强度。只返回模型相关字段，不展示密钥、完整配置或配置层。目录默认项可能不同于有效配置；自定义路由名称不说明底层模型或能力排名。

队长可直接在 `teams_start` 传入 `models: {expert: {model, effort}, simple?: {model, effort}}`，每次启动按实际模型目录检查；expert 负责复杂任务、独立审查与重试。选择仅作用于该 attempt，不修改其他成员或持久偏好。任务合同的可选 `model` / `effort` 可以单独指定成员模型与强度（effort 必须同时有 model）；review 必须匹配 expert，重试忽略任务覆盖。未知模型或不支持的强度在推理前拒绝，不静默替换。

`teams_models({workspace: cwd, confirm:true})` 是可选的真人偏好表单。宿主负责展示，工具参数不能伪造同意；明确提交 `remember=true` 才保存本项目偏好，false 仅本会话，取消保留旧分工。表单等待/拒绝不会新建 runtime 或取得 owner；已有 runtime 的 owner 不受影响。`teams_models({forget:true})` 或 `CLI models --forget` 撤销偏好。启动时省略 models 可复用有效偏好；无偏好也无显式选择时返回可操作错误。

| 合同 | 使用模型 |
|---|---|
| `profile=auto`，`complexity=simple`，非 review | 本次选择的 simple；未选择 simple 时使用 expert |
| `profile=auto`，bounded/uncertain/complex 或 review | expert |
| `profile=expert` | expert，即使任务简单 |
| `profile=simple` | 仅允许明确 simple 的非 review 任务，且已选择 simple |
| 合同 `model` / `effort` | 显式成员覆盖，review 须匹配 expert |
| 写任务独立审查、显式失败重试 | 本次派发的 expert，重试忽略任务覆盖 |

[简单任务示例](examples/simple-task.json) 展示 simple/auto 用法。

“范围有限 bounded”不等于简单。任务复杂度由队长判断，用户可指定某任务使用 expert。每次 attempt 保存选择理由、确认来源、确认时间和 reviewer 模型；切换策略不会改变已执行 attempt 的验收依据。

队长仍是当前聊天模型，请在 Codex 中选择您希望使用的高级模型；插件不能替您改变当前聊天模型，也不把简单模型选择视为通过质量评测。模型不可用时明确失败，不静默替换。

宿主不支持表单或外层 approval_policy=never 时，表单可能直接 decline；此返回不构成真人同意。队长显式选择入口不依赖表单，成员自己的 approval=never 保持。CLI 可通过 `--models` 传入相同分工，支持无 TTY 执行：

```sh
node src/cli.js models --config ./teams.local.json
node src/cli.js run --config ./teams.local.json --task ./examples/read-only-task.json \
  --models '{"expert":{"model":"实际模型标识","effort":"high"}}'
```

请用目录中实际存在的模型及支持强度替换示例值。不传 `--models` 时，CLI 优先复用有效偏好，否则保留交互式选择，最后输入 yes 才确认。CLI 与已持 owner 的 MCP 不能同时修改同一项目；先结束已有任务并关闭其连接。status/review/integrate/cancel 不启动新模型，也不需要额外模型确认。

CLI `start/run/integrate` 的阶段变化和每 30 秒状态回执写到 stderr，stdout 保持一份最终 JSON。最近记录时间不是实时心跳，也不证明模型正在推进；结束时会标明等待队长复核或实际失败。SIGINT/SIGTERM 先取消执行、等待退出并输出终态，再释放数据库 owner，避免关闭数据库后读取结果。

## 可重复验证

```sh
npm test
npm run test:coverage            # 内置覆盖率，只统计 src，测试不调用模型
node scripts/smoke-plugin.js       # 临时 CODEX_HOME，真实宿主插件安装/缓存/MCP，无模型
node scripts/smoke-sandbox.js      # 临时工作区，实际文件/网络限制，无模型
node scripts/smoke-live.js --model <available-model>
node scripts/smoke-write-live.js --model <available-strong-model>
```

GitHub Actions 在 `ubuntu-24.04` / `macos-14` 与 Node `24.0.0` / `24.x` 上运行同一套离线测试并报告源码分支覆盖率；生产依赖封装和真实 SDK MCP 检查包含在测试中。CI 的 `npm ci --ignore-scripts` 需要下载锁定依赖，测试阶段不调用 Codex 模型或读取账号配置。真实宿主安装与沙箱 smoke 仍在具备 Codex 的受控环境单独运行，不计作普通 CI 已验证。

最后两条显式使用模型额度。写 smoke 在临时仓库完成 writer、独立 reviewer、前后真实命令、队长核验与集成，保留本机证据；单次通过只证明接入和运行链路，不证明复杂任务通过率。详见 STATUS.md。

核心源码保持单一链路：contracts/policy → runtime/store → app-server、workspace/verification；MCP 与 CLI 为两个入口，plugin 只负责本机封装。参考官方 Codex/插件规范、Git worktree、Execa、Symphony 等成熟实现的执行边界，具体来源和取舍见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 目标与启动前检查

MCP `teams_create` 的 `expectedWorkspace` 由队长从聊天上下文或授权任务目标自动填写。全局插件据此选择项目；旧固定配置与请求不一致时拒绝创建。新任务保存 realpath、目录设备/inode、Git 目录和 commonDir 身份，启动/集成前核对；历史未绑定任务可查看/取消，但重新启动必须创建新合同。overview、终端和 HTML 显示实际目标；它来自明确的任务参数，不是 MCP 自动提供的聊天目录。

CLI 使用不含 workspace 的全局配置时，所有项目操作默认目标为当前目录；从其他位置操作时传 `--workspace /absolute/target`。旧固定配置继续锁定原项目，不能用参数覆盖。已保存的有效分工可以用于非交互启动；没有既有确认时仍需要真人表单或交互终端。此规则不允许用 `--yes` 或工具参数代替用户选择。保存的偏好是本机状态，不是抵御同账号恶意修改的安全凭证。

带 executionPlan 的任务准备 worktree 后、调用成员前，检查验证可执行文件是否可用。可以按任务增加以下声明，只声明应当预先存在的依赖，不把计划新建的产物列为必需文件：

```json
{
  "executionPlan": {
    "allowedPaths": ["src", "tests"],
    "verification": {"command": "node", "args": ["--test"]},
    "preflight": {"requiredFiles": ["package.json"], "nodeModules": ["zod"]}
  }
}
```

`requiredFiles` 检查可读普通文件，`nodeModules` 只用 Node 的 require 解析规则定位声明的包入口，不加载模块；纯 ESM/import 条件不由此保证。记录实际 worktree、可执行文件、文件及依赖解析来源，包含可能的向上解析。不会执行基线测试、复制 ignored 依赖或自动联网安装；预检通过不代替后续真实验证。

失败保留原始 error，并在 task/attempt 的 failure 中记录 code、phase 和 nextAction；预检提供三类具体原因，其他执行失败按准备、成员、审计、验证和独立审查阶段分类。退出未确认等原有门禁继续生效。完整质量/效率对照仍待执行，不因本次升级宣称更快或更省钱。
# 0.6.0 正确性与交接升级

本版修复四项已确认边界，增加报告 `limitations` 与一致性诊断、有限动作观察、增量 status/wait。
首次 `teams_status({workspace,taskId,incremental:true})` 取得 cursor，随后传 `afterCursor` 获取无变化回执
或变化摘要；游标跨项目、任务、attempt 或连接失效时重新取完整快照。`verbose:true` 查看完整证据。

动作只记录官方生命周期元数据，不保存命令参数/输出，不证明测试通过；缺失字段保持未知。
成员的验证局限不自动阻塞已完成报告，真实 blocker 必须说明未满足的验收。静态/复现示例与未来效率
评测模板见 [examples](examples/README.md)。同条件总交付收益尚未验证，不承诺提速比例。

源码、候选包与已安装缓存分别验证；按下方流程显式重装后新能力才对正式会话生效。
