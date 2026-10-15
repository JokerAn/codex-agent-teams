# examples 目录说明

本目录是手工模板。`teams.config.json` 默认不含 `workspace`，可供一个全局插件跨项目使用，
无需每个项目重新打包。队长从当前聊天目录或已授权目标取得真实 checkout 的绝对路径并传给工具，
不要求用户重复提供已知路径；宿主并不会自动把聊天 cwd 注入 MCP 参数。

## 项目选择与两个入口

| 入口 | 目标来源 |
|---|---|
| CLI 配置不含 `workspace` | `--workspace`，缺省为当前目录；任务中的 `expectedWorkspace` 仍须匹配 |
| MCP `teams_create` | 必填 `expectedWorkspace`，由队长从任务上下文自动传入 |
| 带hooks的MCP启动/集成 | 必须传任务目标的绝对workspace，由队长从target.root填写 |
| MCP 模型、列表或重连后的任务操作 | 传 `workspace`；同一连接已知 `taskId` 可直接路由 |
| 旧配置含 `workspace` | 保留固定目标语义，不会随聊天项目切换 |

状态与记住的模型分工按项目保存，新项目首次需真人确认。当前项目保存的有效分工可复用，
不能跨项目套用。每个项目仍只有一个运行时 owner；全局插件不会共享或绕过其他会话的 owner。
不要把插件安装目录、缓存目录或配置文件所在目录当成任务目标。

## 任务合同文件

四个任务合同文件都**只面向 CLI**（都不含 `expectedWorkspace`）。用 `teams_create` 时由队长加上
任务上下文中已知的绝对路径，不要直接喂给工具。

| 文件 | 用途 | 入口 |
|---|---|---|
| `simple-task.json` | `simple`/`auto` 只读查询示例 | 仅 CLI |
| `read-only-task.json` | 普通只读分析合同 | 仅 CLI |
| `verified-read-only-task.json` | 带独立 worktree + 验收命令的只读任务（`executionPlan.verification`） | 仅 CLI |
| `write-task.json` | 写任务模板，必须替换目标、验收标准、`allowedPaths` 与命令 | 仅 CLI |

```sh
node src/cli.js run --config ./teams.local.json --task ./examples/read-only-task.json
```

`simple-task.json` 与 `read-only-task.json` 的 `title` 字段写着「仅 CLI」，这是刻意保留的提示：
JSON 不支持注释，而 `taskSchema` 是 `strictObject`，加任何 `_comment` 之类的自定义键都会被
`unrecognized_keys` 拒绝（已实测），任务反而连 CLI 都跑不起来。所以只能把提示写进 schema 允许的
`title` 里。它同时是状态视图和回执里显示的任务名，改掉不影响合同语义。

## MCP `teams_create` 模板

队长先用 `teams_models({workspace: cwd})` 读取实际模型及当前项目偏好。没有偏好时直接在
`teams_start` 传入 `models: {expert: {model: "实际模型标识", effort: "支持的强度"}}`；真人表单是可选设置。
`cwd` 来自当前聊天上下文。
然后把下面的 `expectedWorkspace` 替换为同一个已知绝对路径，调用 `teams_create` 和 `teams_start`。
带hooks的start/integrate必须显式传任务target.root作为workspace；已知taskId的查询/复核/取消可省略路径，重连后补workspace；多项目列表明确指定项目。

```json
{
  "objective": "读取根 package.json，列出其中声明的测试命令，不执行命令",
  "expectedWorkspace": "/absolute/path/to/target-checkout",
  "kind": "lookup",
  "complexity": "simple",
  "acceptance": ["逐字引用存在的测试 script；不存在时明确说明"],
  "context": ["只读指定文件，不安装依赖，不修改文件，不访问外部服务"]
}
```

写任务可从 `write-task.json` 复制，再添加同样的 `expectedWorkspace`。允许修改的范围填在
`executionPlan.allowedPaths`，使用仓库相对路径；顶层 `files`、顶层 `allowedPaths` 和
`executionPlan.files` 都会被拒绝，并给出迁移提示。执行前必须存在的文件填在
`executionPlan.preflight.requiredFiles`，它与允许修改范围用途不同，不能互换。
`complexity` 缺省仍为 `uncertain`；只有明确简单的任务才填 `simple`，`auto` 模式下的 `bounded` 仍使用 expert。

## 配置与命令合同文件

这些不是任务合同，走各自的入口：

| 文件 | 用途 | 入口 |
|---|---|---|
| `teams.config.json` | 复制为全局 `teams.local.json`，填写 codexBin、expert 模型；不填 workspace | `--config` |
| `mcp.config.toml` | 手工接入 Codex 的 MCP 配置片段 | 手工合并，项目不代改用户配置 |
| `verification.json` | 单条验收命令合同 | `node src/cli.js workspace verify --spec ./examples/verification.json` |

如需兼容旧的固定项目用法，可在配置增加 `"workspace": "/absolute/path/to/checkout"`。
该配置继续锁定目标；跨项目使用时采用不含此字段的全局配置，不能靠参数绕过固定目标检查。
CLI 在目标 checkout 中运行，使用全局配置与任务模板的绝对路径，或显式传 `--workspace`。
MCP 配置中的路径只是 Node、插件源码和配置位置，无需绑定项目。

`mcp.config.toml` 里 `tool_timeout_sec = 330` 不是随手填的：`teams_wait` 的 `timeoutMs` 上限是
300000（5 分钟），宿主按整个工具调用计时，填 45 会让一次合法的长等待在传输层先断开，而成员其实还在
运行（`teams_wait` 超时不取消成员）。详见该文件内的注释。

## 清理过期本机包

`npm run build` 每次都会生成新的 `dist/marketplace-*` 目录且不清理旧的，多个包共用同一个
marketplace 名称，容易在 Codex 里选到过期副本。用下面的脚本查看（默认空跑，不删除）：

```sh
node scripts/clean-dist.js            # 列出将删除的目录，保留最近 1 个
node scripts/clean-dist.js --keep 3   # 保留最近 3 个
node scripts/clean-dist.js --yes      # 确认后真正删除
```
# 0.6.0 报告与观察

`analysis-result.json` 演示满足验收的静态报告如何记录 `limitations`，它是格式示例，不是运行证据。
真正的 `blockers` 必须影响未满足的 criterion，并在其 evidence 中说明；所有 criterion 都满足却有 blocker
会被诊断为矛盾报告。旧报告省略 limitations 仍可读取，不自动改变旧 blocked 状态。

需要复现的 finding 应包含 file:line、触发条件、预期/实际、可审阅步骤或代码、实际执行者和验证边界。
只读成员不创建真实 Git fixture；队长承担已声明的验证及 STATUS 文档。不要自动执行报告中的代码。

首次查询 `teams_status({workspace,taskId,incremental:true})` 获取连接内 cursor，后续
`teams_wait({taskId,timeoutMs:10000,afterCursor:cursor})` 或 status 返回无变化回执/变化摘要。
游标跨项目、任务、attempt 或 MCP 重连失效，按错误指引重新取完整快照；`verbose:true` 获取原始证据。
旧缓存无这些字段时沿用旧观察接口，先完成源码/候选包验证再单独更新正式安装。

`evaluation-record.json` 是未来同条件评测记录模板，不调用模型、不证明速度收益。
主任务总时长来自宿主/评测器，不能用成员并行时长代替；所有方案均记录完整主子用量，null 保持未知。
