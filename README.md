# Codex Agent Teams

准确率与完成效率优先，成本其次。一个小型、本机运行的 Codex 委派插件。

**0.2.2 支持真实写任务闭环**：合同 → 独立 worktree 修改 → 命令验证 → 全新强模型线程审查 → 队长复核 → 显式集成 → 源工作区再次验证。不会自动提交或推送。只读任务继续支持并发、依赖、取消与显式重试。

0.2.1 补齐失败重试的执行信息归属、只读成员与 reviewer 的实际目录校验，以及协议致命错误后的缓冲释放；新增 macOS/Linux 离线 CI。

设计依据：[PRINCIPLES.md](PRINCIPLES.md)。验证记录：[docs/STATUS.md](docs/STATUS.md)。项目使用 Node.js 24+、原生 ESM、内置 SQLite、官方 MCP SDK 与 Zod，没有编译步骤、前端或后台协调者。

## 快速开始

需要可用的 Codex CLI 和模型账号。本机实测 Node `24.21.0`、macOS arm64、Codex `0.147.0-alpha.6.5`；其他版本先运行 doctor。

```sh
npm ci
npm test
node src/cli.js doctor
```

复制 `examples/teams.config.json` 为 `teams.local.json`，填写实际 workspace、Codex 可执行文件和 expert 模型。不要提交这个本机配置。相对 workspace/带路径的 codexBin 以配置文件目录为基准，普通命令名从 PATH 查找。

```sh
node src/cli.js doctor --config ./teams.local.json --check-thread
```

doctor 只做握手、模型/推理强度与可选只读线程权限检查，不启动推理。写成员的权限另外按本机协议核对。任务执行会使用账号模型额度；`npm test` 不调用模型。

## 接入 Codex

```sh
node src/cli.js pack --config ./teams.local.json --out ./dist/marketplace-v0.2.2
node src/cli.js doctor --plugin ./dist/marketplace-v0.2.2 --check-thread
```

pack 生成本机 marketplace：包含 skill、MCP、源代码、配置快照和锁定的生产依赖，不包含测试或运行数据。需要先 npm ci；拒绝覆盖已有输出。插件根目录的相对路径可随宿主缓存搬迁，Node/Codex 仍依赖本机安装。

以下两条由用户明确选择执行，会修改宿主插件配置：

```sh
codex plugin marketplace add /absolute/path/to/dist/marketplace-v0.2.2
codex plugin add codex-agent-teams@codex-agent-teams-local
```

在新聊天中使用 `codex-agent-teams:team` skill，确认七个 teams_* 工具可用。项目不会自动安装到用户配置；已验证临时 CODEX_HOME 中真实安装、缓存启动、工具注入和调用，桌面 UI 安装未代操作。宿主缓存不自动跟随源码更新；版本/配置更新后生成新包并刷新或重新安装。

也可按 `examples/mcp.config.toml` 手工配置 MCP：

```sh
node src/cli.js mcp --config /absolute/path/to/teams.local.json
```

每个目标工作区同时只允许一个实际运行时；插件与手工 MCP 选一种，避免两个运行时争抢状态库；只读状态观察可以并存。握手和工具清单连接不会获取 owner。关闭 MCP 会取消活跃成员/命令，成员不会自动唤醒已结束的父聊天。

| 工具 | 用途 |
|---|---|
| teams_create | 固定合同、必要上下文、依赖与验收条件；不调用模型 |
| teams_start | 启动成员；可选工作区/验证计划；失败重试须明确理由，统一 expert，最多三次 |
| teams_status | 只读状态、attempt 与证据；overview 显示版本、阶段、耗时及验收摘要 |
| teams_wait | 最多等待 30 秒，超时不取消 |
| teams_review | 队长逐项复核指定 attempt；写任务通过后仍等待显式集成 |
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

当前通过本地 marketplace 安装，宿主使用插件缓存副本。修改项目源码或 `teams.local.json` 后，先生成并检查新包，再卸载旧插件、切换来源并重新安装；仅修改 `src/` 不会更新已安装副本。

以下以当前 **0.2.2** 为例。后续升级时替换为新版本号，并选择尚不存在的输出目录。

1. 更新源码并同步版本号：`package.json`、`package-lock.json` 的顶层与根包版本、`plugin.json`、`.codex-plugin/plugin.json`。MCP 与 App Server 的版本元数据直接读取 `package.json`；pack 会检查包与两个插件 manifest 的版本一致。
2. 在项目根目录先验证并生成新包。输出目录必须尚不存在；保留旧包，便于需要时恢复。

```sh
npm ci
npm test

node src/cli.js pack \
  --config ./teams.local.json \
  --out ./dist/marketplace-v0.2.2

node src/cli.js doctor \
  --plugin ./dist/marketplace-v0.2.2 \
  --check-thread
```

3. 新包检查通过后，等现有团队任务结束或明确取消并确认退出，关闭使用旧插件的 Codex 会话。在项目根目录的独立终端切换安装：

```sh
# 卸载旧插件，清除它的安装配置和缓存
codex plugin remove codex-agent-teams@codex-agent-teams-local

# 新包目录变了，切换同名 marketplace 的来源
codex plugin marketplace remove codex-agent-teams-local
codex plugin marketplace add ./dist/marketplace-v0.2.2

# 安装新插件
codex plugin add codex-agent-teams@codex-agent-teams-local
```

4. 重启 Codex 并开启新聊天，确认 `codex-agent-teams:team` skill 和七个 `teams_*` 工具可用。安装结果应显示预期版本。若第一次接入、尚未安装旧版，则直接添加新 marketplace 并安装，跳过 remove。

卸载插件清理宿主的安装配置和插件缓存，不删除目标工作区 `.codex-teams/` 中的任务、worktree 或日志。不要为了升级手工删除运行数据。切换 marketplace 必须指向新包目录，否则可能重新安装旧包。

本机 `codex plugin marketplace upgrade` 用于刷新 **Git marketplace** 快照，不适用于这里的本地目录换包流程。本地来源切换与 0.2.0 → 0.2.1 重装已在临时 `CODEX_HOME` 中实际验证；没有操作用户正式配置。

如果使用的是手工 MCP 配置，源码入口直接指向本地项目，则无需卸载插件：更新源码和依赖、验证后重启对应 Codex/MCP 进程即可。

## 只读与写任务

普通只读合同见 `examples/read-only-task.json`；可选独立 worktree 与验收命令见 `examples/verified-read-only-task.json`。

```sh
node src/cli.js run --config ./teams.local.json --task ./examples/read-only-task.json
```

返回 awaiting_review 是预期，成员不能自我验收。写任务先按 `examples/write-task.json` 替换实际目标、验收标准、allowedPaths 和命令。必须选择 expert，mode=workspace-write，并有 executionPlan。

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

带工作区/写计划的任务当前串行，普通只读默认并发 2、最多 4。qualified 模型需配置明确的任务评测资格，写任务和独立审查固定 expert；不静默降级、不声称未经对照评测的节省比例。

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
