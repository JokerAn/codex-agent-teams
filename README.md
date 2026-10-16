# Codex Agent Teams

默认使用 Codex 原生子 Agent 协作。一个简短的 team skill 负责分工、最小必要上下文和结果复核；不为普通任务启动外置 MCP、App Server、数据库或状态页。

**0.8.0 改变了默认安装内容。** 原合同、日志/文件证据、独立审查和受控集成仍保留在可选严格包中，用 `--strict` 明确选择。没有新增双后端调度器。

## 默认使用

在已支持原生子 Agent 的 Codex 中，可以直接用一句话要求分工。安装本 skill 后可这样请求：

> 用 team 分工检查接口与页面，你负责追踪主调用链；修正问题并核对结果。

也可以明确写入归属与验收：

> 用 team 协作：成员只改独立工具函数和对应测试，用 low；你负责页面接入和共享配置，用 high。保持现有模型，先分清文件归属，再各自开工，最后核对测试证据。

用户明确指定的模型和强度优先，不静默降级。宿主支持时，low 适合边界清楚、能独立验收的任务；跨组件、关键实现或不确定工作默认 high；max 仅用于重要不确定性或 high 未解决的缺口，且必须由宿主支持。这里是派发建议，不是自动选路器；请求值不等于实际回执，实际模型、强度或用量未知时如实说明，不承诺更小模型或更低费用。

小任务直接完成，有独立工作或需要第二视角时再派发。派发前说明队长自己的独立产物和成员交付；若队长只剩等待与汇总，重新判断是否值得拆分。通过宿主支持的派发参数显式关闭父历史继承，任务包只带必要上下文、实际运行时路径与验收命令。宿主容量不足时复用空闲成员、直接推进或等待现有工作完成，避免连续新建。

成员可以接收后续指令；模型或强度的切换必须通过宿主支持的参数，不能只发一句“升到high”就声称已切换。队长复核实际改动和测试执行数量，不能只看退出码；验收可疑时用负对照确认能报错。原生工具不可用时会说明，不静默切到外置执行器。

并行写入先明确文件归属，共享接口和配置由队长统筹；冲突先串行或重新分工。成员只短交接改动、证据和缺口，缺信息或小修优先复用原成员，不发送长日志或整段源码；环境故障不自动升级成重跑，不无限重试。

### 构建与安装

使用准备好的默认发布包时，不需要Node.js或项目依赖；需要宿主提供插件安装和原生子Agent能力。当前实际验证环境为macOS arm64、Codex CLI `0.162.0-alpha.17.2`；其他宿主版本的插件与子Agent接口需要各自确认，不能从本机通过推断全部兼容。

下载并解压 `codex-agent-teams-native-0.8.3.tar.gz` 后，添加其中的marketplace目录：

```sh
tar -xzf codex-agent-teams-native-0.8.3.tar.gz
codex plugin marketplace add ./codex-agent-teams-native-0.8.3
codex plugin add codex-agent-teams@codex-agent-teams-local
```

桌面端也可在“添加插件市场”中填写该解压目录，再安装 `codex-agent-teams`。安装或更新后重开会话。使用发布包同时提供的SHA256清单核对下载文件，并保留解压后的marketplace目录，以便后续更新失败时恢复旧来源。

GitHub仓库根是开发源码，没有marketplace清单；不要将源码根或仓库URL直接当作上述发布包来源。对外分发的是构建后的native marketplace。当前源码更新脚本管理本地marketplace；不自动迁移Git或其他远程来源。正式发布资产、commit与push由维护者另行执行。

从源码准备发布包需要 Node.js 24+：

```sh
npm run build
```

默认构建只复制一个 skill 和元数据：不运行 npm ci，不读取 teams.local.json 或模型配置，不探测 Codex，也不启动子进程。包内没有运行依赖、hooks、MCP 配置或绝对 Node/Codex 路径。它依靠安装宿主自己的原生能力。

默认构建要求有效SemVer版本及非空包名/说明，native manifest只允许当前的name/version/description/skills字段；增加新的资源入口或metadata字段必须显式调整校验并补验证，防止把未经准备的内容带入发布包。

命令打印本地 marketplace 目录。在 Codex 中添加该来源并安装 `codex-agent-teams`；已有安装需要更新缓存并重开会话。构建不会修改正式安装。

维护者可从该目录准备发行资产。以下示例使用本次待发布版本，打包时包含隐藏的marketplace清单：

```sh
npm run build -- --out ./dist/codex-agent-teams-native-0.8.3
tar -czf ./dist/codex-agent-teams-native-0.8.3.tar.gz -C ./dist codex-agent-teams-native-0.8.3
shasum -a 256 ./dist/codex-agent-teams-native-0.8.3.tar.gz
```

如需通过本机官方 CLI 更新：

```sh
npm run update
```

**默认 update 会把旧严格安装替换为原生 skill 包。** 若仍需旧外置能力，使用下节的 `--strict`。更新需要 Codex CLI，保留任务退出/交接检查与失败恢复；先结束有关 Team/MCP 会话，不会自动重启宿主或删除项目历史数据。

更新在任何替换操作前核对旧marketplace来源与已安装缓存，并在卸载旧插件前再次检查。native模式还会核对完整目录清单，只允许`.codex-plugin/plugin.json`、`package.json`、`build-info.json`、`skills/team/SKILL.md`及其父目录，拒绝额外skill、文件、目录、链接和不符的路径类型；这项检查覆盖候选、旧缓存、恢复来源、安装结果及回滚结果。来源丢失、损坏或漂移时提前停止，保留旧安装；先恢复与缓存一致的来源再重试。旧缓存缺少有效`build-info.json`身份时也会停止自动更新，需要人工核对并迁移旧安装，单独恢复来源不能补齐该身份。strict模式仍核对关键文件，运行依赖不逐文件核对；不承诺来源在检查之后仍不会被其他进程修改。

自定义输出与 Codex 安装路径：

```sh
npm run build -- --out ./dist/native-candidate
npm run update -- --binary /absolute/path/to/codex
```

`--config` 是严格包参数；默认原生包没有模型配置。源码 CLI 也可无依赖打原生包：

```sh
node src/cli.js pack --out ./dist/native-manual
# strict源码CLI也接受显式执行文件覆盖，不会改写原配置：
node src/cli.js pack --strict --config ./teams.local.json --binary /absolute/path/to/codex --out ./dist/strict-manual
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
npm run test:native            # 默认包快速回归
npm test                       # 全部回归，含可选严格链路
node scripts/smoke-native.js   # 临时官方宿主验证默认包，无模型推理
node scripts/smoke-plugin.js   # 临时官方宿主验证严格包，无模型推理
```

运行严格源码命令前需要安装项目依赖。无推理smoke只使用临时Codex home，不更新用户正式配置；真实模型与效率对照分别记录。自动化通过不证明比原生更快。

[当前开发摘要](docs/CURRENT.md) · [当前计划](UPGRADE-PLAN.md) · [0.8.3修复记录](docs/FIX-0.8.3-2026-10-16.md) · [场景验收](docs/TEAM-SCENARIOS.md) · [状态与证据](docs/STATUS.md)
