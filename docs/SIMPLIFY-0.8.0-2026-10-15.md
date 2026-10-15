# 0.8.0 默认流程精简交付

2026-10-15，Asia/Shanghai。依据 [原则](../PRINCIPLES.md) 与 [精简计划](../UPGRADE-PLAN.md)，用户授权实施。实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，开工HEAD `af6d79b`，index tree `227dbb151a1c80b448b9741c143426a401a7c0f6`。完整结果字段见 [证据JSON](SIMPLIFY-0.8.0-2026-10-15-EVIDENCE.json)。

## 已实施

默认安装与使用改为宿主原生子Agent＋19行team skill。保留独立分工、最小充分上下文、队长同步工作、后续指令与按风险验证；普通任务不再要求外置合同、模型发现、状态库、面板、固定轮询或逐项JSON复核。未增加原生后端适配器或双后端调度。

旧操作指南移至 `skills/strict-delivery/SKILL.md`，只有明确要求严格交付时使用。其合同、独立工作区、验证/审查/集成、取消/退出与恢复保障沿用原实现。默认包不提供该skill或MCP工具，不能自动切换或偷偷安装严格包。

| 项目 | 默认原生包 | 显式严格包 |
| --- | --- | --- |
| 安装文件 | **4个，3052字节** | 983个，14219720字节 |
| skill | team（19行） | team＋strict-delivery |
| MCP / hooks | 0 / 0 | 原8工具与3种hooks |
| 源码/依赖/模型配置 | 不包含 | 原运行时、生产依赖与本机配置 |
| 构建行为 | 复制skill和元数据 | 锁定依赖/本机预检/原严格打包 |
| 命令 | `npm run build`、`npm run update` | 两者显式加 `--strict` |

这是本轮实际产物大小，不是运行加速比例。源码仓库仍保留严格模块，未通过删历史证据或大规模重构制造“精简”。

## 模块保留与退出默认清单

| 模块 | 依赖与用途 | 本轮决定 |
| --- | --- | --- |
| team skill | 宿主原生派发/后续指令/等待 | 默认，收敛到19行，不带大段历史/协议 |
| plugin-package.js、build | Node内置API、技能与manifest | 默认打包基础；无需zod、MCP SDK或Codex可执行路径 |
| update | 官方CLI安装/回退与包身份 | 明确执行时使用；默认原生，`--strict`保持旧能力；两者同一插件标识，不同时运行双后端 |
| App Server、MCP、models | 外置执行和目录发现、严格工具入口 | 退出默认包；严格包按需保留，不向原生工具再套一层 |
| runtime/store/contracts/policy | 严格合同、持久attempt、owner、验收 | 退出默认包；与严格证据链完整保留，暂不单拆状态门禁 |
| workspace/verification | Git基线、保留用户现场、命令/文件/日志证据 | 严格用途保留；普通原生协作使用其宿主现有工具 |
| host lifecycle/process guard | 管理外置进程退出/中断归属 | 仅严格包保留；默认包没有相应外置进程，故不注册这些hooks |
| status/actions/observation | 严格历史、动作与本地页面 | 退出默认包，普通任务不再强制面板/固定轮询；不继续扩展归档 |

旧模块进一步退役需确认真实严格交付用例、调用依赖与历史读取需求。此次已移除默认安装/运行负担；未声称仓库所有复杂度已消除。README由长历史说明改成默认用法、严格选择与迁移，严格示例留在examples。

## 修复与独立复核

一名原生子Agent审查构建/安装边界，模型krill/gpt-6.1-sol/high，fork_turns=none，仅给当前任务与必要路径，不通过Agent Teams MCP。

审查指出：CLI pack默认改原生后，顶部仍提前加载严格模块。队长确认静态链路，新增无依赖CLI反例；第一版缩小fixture因缺src/status.js失败，随后改成复制完整src以覆盖真实无zod场景。生产CLI改为仅顶层导入builtin，非pack/help命令才延迟加载严格模块；完整src、无node_modules、空PATH的CLI回归通过。审查者限定复核修补与迁移说明后无新增具体阻塞；队长结合实际测试验收，未把成员自述当运行证据。

首轮定向48/49，唯一失败是新增Windows受控测试的argv形式错误；修正测试为eval入口可用形式后通过，未改生产平台拒绝规则来迁就用例。日志保留。skill-creator quick_validate因Python缺yaml模块不可用，没有自动安装；独立检查两份frontmatter字段/命名通过，真实宿主发现与原生成员行为验证补充了证据，不能说quick_validate通过。

## 验证

- 最终定向 **65/65**，14868.919708ms；最终全量 **339/339**，0 fail/cancelled/skipped，97725.593709ms，Node v24.21.0/macOS。
- 干净目录默认build与CLI pack：空PATH、无node_modules、缺失Codex/npm配置可完成；不生成teams.local.json或.codex-teams。
- 默认实际 `npm run build` 通过，没有依赖安装、模型发现或App Server启动。
- 官方临时Codex home：来源移除后缓存team仍可发现；0外置MCP、0插件hooks、无项目状态目录，4文件3052字节，App Server测试客户端确认退出。这里的App Server仅为本次验收探针，未进入默认包。
- 严格包官方临时宿主smoke通过：team/严格指南、原8工具/3种hooks和退出保障相关检查保持；未执行真实桌面停止按钮。
- 官方临时CLI：严格→原生、原生→严格、同版本缓存替换，以及切换失败恢复原严格身份通过，39次CLI调用，正式用户配置未改。
- 两种最终产物与对应源码/skill一致；默认manifest不声明MCP/hooks，严格manifest打包时补回。

官方旧插件文档入口本轮返回403，未猜其内容；格式兼容结论来自上述本机官方CLI/App Server实际协议发现。已有官方原生能力依据见 [产品分析](PRODUCT-DIRECTION-2026-10-15.md)。

## 两组小样本与局限

同一模型/强度、相同文件与业务需求，分别用原生成员和严格TaskRuntime处理两个微型只读审查：购物数量0、目录路径前缀边界。两条路径各自独立发现正确问题，队长用当前函数和修正函数执行输入/预期断言通过，未修改样本源文件。

原生两份报告无需修正；原提示“仅允许样本目录”与要求读skill有歧义，队长明确范围后两成员均实际读skill并确认报告不变，记录为2次范围澄清follow-up，不隐去这项人工交接。严格两任务报告完成分别41129ms/27342ms，进程退出确认。其存储是内存数据库，状态保持awaiting_review，队长独立核对证据；未伪写运行时succeeded。

原生接口未提供完整可比较耗时，两种方式执行顺序未随机、缓存未控制，严格样本也未包含公共MCP/hooks和持久数据库开销。因此这轮只证明默认技能与原生工作流可用、结果正确；**不计算加速/费用比，不把微型审查外推为真实修改交付收益。** 若要据时间决定进一步删严格模块，仍需有可比端到端数据，现有证据不足。

## 产物与交付

- 原生最终包：`dist/marketplace-v0.8.0-native-final-20261015`。
- 严格最终包：`dist/marketplace-v0.8.0-strict-final-20261015`。
- digest与大小在证据JSON；较早候选保留，不作为最终交付。临时Codex home和样本目录已清理。

本轮源码/测试/文档在主目录，未暂存，HEAD/index保持，没有commit/push、正式安装/用户hooks信任、历史数据库清理或跨worktree未同步。已加载旧插件不会随源码变化切换；结束相关旧Team会话后再显式update并重开聊天。默认update会替换为原生包，继续需要外置工具时显式加--strict。
