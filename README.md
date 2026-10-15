# Codex Agent Teams

默认使用 Codex 原生子 Agent 协作。一个简短的 team skill 负责分工、最小必要上下文和结果复核；不为普通任务启动外置 MCP、App Server、数据库或状态页。

**0.8.0 改变了默认安装内容。** 原合同、日志/文件证据、独立审查和受控集成仍保留在可选严格包中，用 `--strict` 明确选择。没有新增双后端调度器。

## 默认使用

在已支持原生子 Agent 的 Codex 中，可以直接用一句话要求分工。安装本 skill 后可这样请求：

> 用 team 分工检查接口与页面，你负责追踪主调用链；修正问题并核对结果。

小任务直接完成，有独立工作或需要第二视角时再派发。成员可以接收后续指令；队长继续自己的工作，最后核对实际证据。原生工具不可用时会说明，不静默切到外置执行器。

### 构建与安装

源码构建需要 Node.js 24+：

```sh
npm run build
```

默认构建只复制一个 skill 和元数据：不运行 npm ci，不读取 teams.local.json 或模型配置，不探测 Codex，也不启动子进程。包内没有运行依赖、hooks、MCP 配置或绝对 Node/Codex 路径。它依靠安装宿主自己的原生能力。

命令打印本地 marketplace 目录。在 Codex 中添加该来源并安装 `codex-agent-teams`；已有安装需要更新缓存并重开会话。构建不会修改正式安装。

如需通过本机官方 CLI 更新：

```sh
npm run update
```

**默认 update 会把旧严格安装替换为原生 skill 包。** 若仍需旧外置能力，使用下节的 `--strict`。更新需要 Codex CLI，保留任务退出/交接检查与失败恢复；先结束有关 Team/MCP 会话，不会自动重启宿主或删除项目历史数据。

自定义输出与 Codex 安装路径：

```sh
npm run build -- --out ./dist/native-candidate
npm run update -- --binary /absolute/path/to/codex
```

`--config` 是严格包参数；默认原生包没有模型配置。源码 CLI 也可无依赖打原生包：

```sh
node src/cli.js pack --out ./dist/native-manual
```

## 可选严格交付

只有明确需要以下能力时选择严格包：不可变任务合同、持久attempt、独立worktree、文件/日志指纹、命令验证、独立expert reviewer、队长复核、显式集成和源复验。

```sh
npm run build -- --strict
npm run update -- --strict
# 直接指定已准备的配置：
npm run build -- --strict --config ./teams.local.json --out ./dist/strict-candidate
```

严格构建保留 macOS/Linux、Node.js 24+、锁定依赖安装、Codex可执行文件及模型/只读权限预检。可用 `--binary /absolute/path/to/codex` 指定本机CLI；首次缺配置时准备本机配置，已有配置保持。这些要求不应用于默认原生包。

严格包包含原生 `team` 和单独的 `strict-delivery` skill，以及原MCP/hooks/运行时。普通team仍走原生；明确要求严格交付时才读取 [strict-delivery操作规则](skills/strict-delivery/SKILL.md)。默认包不提供该技能或MCP工具，不会自动安装它们。

严格包启用且宿主信任hooks后：队长通过实际模型目录明确选择角色，创建绑定任务目标的合同；start/integrate显式传任务target.root作为workspace。只读任务可并行，带执行计划任务保持独占。写候选必须通过命令、独立审查和队长验收，显式集成后源复验才成功。未知退出不得重派，失败集成保留现场，不自动commit/push。具体CLI/工具示例见 [严格模板](examples/README.md)。

从原生切回严格或反向切换均需重新构建/更新并重开会话。二者使用同一个插件标识，代表选择安装内容，不是在宿主中运行两个并行调度后端。历史 `.codex-teams`、旧缓存与worktree不会被构建/更新顺手清除。

## 开发与验证

```sh
npm ci --ignore-scripts
npm test
node scripts/smoke-native.js   # 临时官方宿主验证默认包，无模型推理
node scripts/smoke-plugin.js   # 临时官方宿主验证严格包，无模型推理
```

运行严格源码命令前需要安装项目依赖。无推理smoke只使用临时Codex home，不更新用户正式配置；真实模型与效率对照分别记录。自动化通过不证明比原生更快。

[原则](PRINCIPLES.md) · [当前计划](UPGRADE-PLAN.md) · [TODO](docs/TODO-UPGRADE-2026-10-15.md) · [状态与证据](docs/STATUS.md)
