# examples 目录说明

本目录的文件是**手工填写的模板**，不是可直接运行的分发产物。当前只有一个入口会替你补
`expectedWorkspace`，另一个不会，所以先看清下表再复制。

## 两个入口的差别（实测）

| 入口 | 是否必填 `expectedWorkspace` | 依据 |
|---|---|---|
| CLI `node src/cli.js run --task <json>` | 否，缺省时自动补 | `src/cli.js:163`：`input.expectedWorkspace ?? values.workspace ?? process.cwd()` |
| MCP `teams_create` | **是**，缺失直接拒绝 | `src/mcp.js:64` 用 `taskSchema.safeExtend({ expectedWorkspace: z.string().min(1) })` |

`src/contracts.js:28` 的 `taskSchema` 里 `expectedWorkspace` 是 `optional()`，所以
`runtime.create` 本身接受缺失值；schema 层面的强制只存在于 MCP 工具那一层。这就是为什么同一份
JSON 走 CLI 能跑、走 `teams_create` 会被 zod 拒绝。MCP 的提示语也说明该值必须是任务上下文里的
绝对路径，不能从插件配置里照抄——路径不符会被 `assertWorkspace` 拒绝。

## 任务合同文件

四个任务合同文件都**只面向 CLI**（都不含 `expectedWorkspace`）。用 `teams_create` 时请自行加上
任务上下文中的绝对路径，不要直接喂给工具。

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

## 配置与命令合同文件

这些不是任务合同，走各自的入口：

| 文件 | 用途 | 入口 |
|---|---|---|
| `teams.config.json` | 复制为 `teams.local.json`，填写 workspace、codexBin、expert 模型 | `--config` |
| `mcp.config.toml` | 手工接入 Codex 的 MCP 配置片段 | 手工合并，项目不代改用户配置 |
| `verification.json` | 单条验收命令合同 | `node src/cli.js workspace verify --spec ./examples/verification.json` |

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
