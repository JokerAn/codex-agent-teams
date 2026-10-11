# Codex Agent Teams

准确率与完成效率优先，成本其次。一个独立、小型、本地运行的 Codex 委派插件原型。

先读 [中心思想](PRINCIPLES.md)。后续工作从 [当前状态](docs/STATUS.md) 和 [路线](docs/ROADMAP.md) 继续。

## 当前能做什么

P0 支持只读任务：队长创建合同 → 新建 Codex 成员线程 → 收集结构化结果 → 队长逐项复核 → 解锁后续任务。

- 默认使用明确配置的强模型；没有评测资格就拒绝 qualified 路线。
- 不复制父聊天历史，传入必要事实与已验收的依赖结果；过大的任务包报错而不静默截断。
- 默认并发 2，最多 4；运行中可取消，任务超时会终止自己管理的成员进程。
- SQLite 持久化任务和 attempt，旧结果不能覆盖新执行；异常退出后不自动重放。
- 运行结束只进入 `awaiting_review`。`succeeded` 表示队长已经逐项记录复核依据，不表示插件独立证明了答案正确。
- 提供 6 个 MCP 工具和 CLI；没有前端，也没有后台自动规划器。

当前写任务、worktree、自动运行测试、跨厂商后端、父聊天主动唤醒均未实现。

## 环境与启动

Node.js 24+，macOS/Linux，已配置且可使用的 Codex CLI。项目使用原生 ESM JavaScript + Zod，没有编译步骤。运行依赖是官方 MCP Server SDK 与 Zod，官方 MCP Client SDK 仅用于测试。

```sh
npm ci
npm test
node src/cli.js doctor --check-thread
```

`doctor` 只做握手和模型列表查询；`--check-thread` 额外新建一个临时只读线程并检查权限响应，不启动模型推理。按实际检测到的可用模型配置，不在代码中固定具体型号。

1. 将 `examples/teams.config.json` 复制为 `teams.local.json`。
2. 填写真实工作区绝对路径、Codex 可执行文件和强模型名称/推理强度。
3. 配置对应账号的权限和额度，执行任务时会调用该账号的模型。

```sh
node src/cli.js run --config ./teams.local.json --task ./examples/read-only-task.json
```

该命令实际启动模型，结果保存在 `<workspace>/.codex-teams/state.sqlite`。返回 `awaiting_review` 是预期行为：CLI 不会替队长批准自己的结果。

不要提交 `teams.local.json` 和工作区中的 `.codex-teams/`。将 `.codex-teams/` 加入目标仓库自己的忽略文件；本项目不会自动修改其他仓库。

## 接入 Codex

P0 将工作流 skill 与本地 MCP 分开配置，避免依赖未经本机验证的插件路径变量。`plugin.json` 与 `.codex-plugin/plugin.json` 提供 skill 包装；**仅加载 skill 不会自动连接 MCP**。

按照 `examples/mcp.config.toml` 的形状填写绝对路径，合并到你实际使用的 Codex 配置。项目不会自动改全局配置。先测试 stdio MCP，再在目标桌面版本中安装 skill/插件；桌面完整安装链路仍需单独验收。

```sh
node src/cli.js mcp --config /absolute/path/to/teams.local.json
```

此命令的 stdout 是 MCP 协议，不能混入普通日志。

| 工具 | 作用 |
|---|---|
| `teams_create` | 创建只读任务合同，不调用模型 |
| `teams_start` | 在依赖通过后执行；失败重试须给出原因，使用 expert |
| `teams_status` | 查询单项结果或精简列表 |
| `teams_wait` | 等待最多 30 秒；等待超时不取消任务 |
| `teams_review` | 队长逐项核查证据，接受或拒绝指定 attempt |
| `teams_cancel` | 取消任务并等待管理的进程退出 |

运行中成员不会自动唤醒已结束的父聊天。队长先做独立工作，需要结果时再有界等待。关闭 MCP 连接会关闭该运行时并取消仍在执行的成员。每个工作区同时只允许一个运行时；多个会话不要各启动一个运行时争抢同一状态库。

## 模型配置

默认只需要 `profiles.expert`。是否足够强由用户选择和任务评测决定，程序不会根据型号名字猜能力。

只有在已完成特定任务类型评测后，才添加可选的 `qualified`：

```json
{
  "model": "your-qualified-model",
  "effort": "high",
  "kinds": ["lookup"],
  "evaluationReference": "evals/local-lookup-2026-10"
}
```

这段放在 `profiles.qualified` 下。使用它的任务必须明确指定 `profile: "qualified"`、`complexity: "bounded"`，且类型在资格列表内。评测引用由操作者提供；当前不会自动检查评测真实性。任意模型故障均不会触发廉价兜底。

## 真实边界

- 新线程不是文件系统隔离。成员依然可能读取允许的项目文件和 AGENTS.md。
- 执行前请求并核对只读沙箱、网络关闭和禁止提权审批；禁用继承的 MCP、插件、hooks、原生多 Agent 和 memories。只读限制的实际强制执行仍依赖宿主和操作系统，接口回显不是渗透验证。
- P0 禁用继承的 MCP 名称仅支持字母、数字、下划线和短横线；无法明确覆盖的配置直接拒绝，不静默放行。
- 不能把队长的复核声明当作真实运行过的测试。自动验证器属于 P1。
- 状态恢复时如发现旧成员 PID 仍存在，会拒绝接管，需确认旧进程退出；不会自动杀死身份不明的旧 PID。
- 持久状态不是断点续跑承诺。重启后中断任务需显式重试，最多三次，之后应重规划。
- 线程用量由宿主报告，缺失时为 null；没有计费或省钱估算。
- CLI/App Server 与桌面宿主的内置版本可能不同。只保证 STATUS.md 中实际验证过的接口。

## 目录

```text
PRINCIPLES.md            中心思想，后续决策依据
AGENTS.md               后续开发协作规则
src/contracts.js        配置、任务、结果和验收合同
src/policy.js           模型选择与上下文包
src/store.js            SQLite、唯一运行时、保守恢复
src/runtime.js          依赖、attempt、并发、取消、复核
src/app-server.js       官方 Codex 执行协议适配
src/mcp.js              官方 SDK 的 6 个工具
src/cli.js              诊断、单任务和 MCP 入口
skills/team/SKILL.md     队长工作流
examples/               配置与任务示例
tests/                  回归、协议故障与 MCP 连接测试
```

下一阶段先实现 worktree 和可重复验证，再允许代码修改。任务驱动推进，不以增加角色数量为目标。

## 可选真实模型检查

```sh
node scripts/smoke-live.js --model <doctor列出的可用模型>
```

这是显式启动的真实模型检查，会消耗模型额度，不包含在 `npm test` 内。它只在临时工作区写入随机 proof.txt，让成员只读提取，通过结构化结果后由脚本精确核对。60 秒截止后取消并清理。它证明单次接入闭环，不证明复杂任务的质量或成本。
