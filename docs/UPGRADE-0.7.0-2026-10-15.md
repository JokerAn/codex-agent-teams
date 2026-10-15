# 0.7.0 修补与状态视图交付

日期：2026-10-15。依据 [PRINCIPLES](../PRINCIPLES.md)、[当前计划](../UPGRADE-PLAN.md) 与 [执行TODO](TODO-UPGRADE-2026-10-15.md)。源码交付主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`；基于当前工作树，不把既有暂存历史混作本轮新增。

A/B已实施，C完成本机回归、独立报告复核、候选、临时官方宿主和一次真实写闭环。正式安装、真实桌面停止、远程矩阵与效率对照保持未完成。结构化回执见 [证据JSON](UPGRADE-0.7.0-2026-10-15-EVIDENCE.json)。

## 改动与兼容

- **B1**：启用lifecycle的路由MCP中start/integrate的workspace必填，hook拒绝缺失目标，不再回退聊天cwd。错误目标仍拒绝，已知taskId查询可省略路径；直接legacy/无hooks入口保持原合同。工具schema、说明、README、skill与示例一致；版本升0.7.0，升级后需刷新连接工具schema。
- **B2**：成功安装与失败恢复共用关键文件身份，包含启动器、MCP/运行配置、manifest/hooks、源码/skill等，记录缺失状态；检查普通文件/父路径symlink和launcher完整执行位掩码。运行依赖未逐文件哈希，legacy身份未知明确报告内容未确认。
- **真实CLI兼容**：本机0.162.0-alpha.17.2的plugin list不含installedPath，add回执包含。依据临时官方CLI确认的布局，在effective Codex home内只读取明确插件/版本缓存路径，不扫描其他缓存，不用来源包冒充实际安装。路径或身份缺失保持未确认；临时home实测同版本替换与失败恢复。
- **B3**：面板支持显式taskIds集合与项目全部切换，显示选定/累计/匹配/展示数，项目视图默认收起历史终态，安装来源放入展开区。搜索与状态过滤先于limit；最多100条，提示遗漏并支持显示更多。选定集合不宣称自动识别会话，不改变历史终态或删除证据。
- **B4**：overview可选projection=summary/catalog；省略时保留完整旧overview，taskId的verbose与增量游标保持。精简投影去掉长objective、报告、动作、usage和owner token，目录标题有界；非法参数组合拒绝。
- **B5**：skill先读最新状态与必要函数、按需读历史；优先精简投影/增量观察，验收时显式读取完整报告。继续要求独立交付、验证职责与真实用量边界。没有新框架、运行依赖、后台调度或并行写。

## 独立复核与补修

Agent Teams MCP一名只读GPT-6.1 Sol/high成员，captain-explicit；task `492608dc-5241-40b9-bf2c-e170482424c1`，attempt `5a0aaedd-76ee-4650-825c-1f6244a2639c`，312.552秒，退出确认。成员审查冻结的首轮A/B快照，提出两项P2。队长新增反例确认两项失败，再修补：

1. 执行位压成布尔值导致0755和0655指纹相同。真实临时文件chmod反例出现Missing expected rejection；改为完整0o111掩码后可检出owner执行位丢失。
2. 显示更多捕获首次limit，刷新仅替换main导致20→40→40。生成脚本+VM实际执行refresh/rebind得到40而预期60；改从新main data-limit读取。回归覆盖40/60/80/100，真实浏览器80条记录验证20→40→60→80。

首轮330/330不能覆盖这两项遗漏。反例日志 `/tmp/teams-upgrade-070-review-counterexamples-20261015.log` 保留。队长逐条核对合同和独立复现后review(pass)，报告succeeded。成员未复验最后修补；最终代码由队长定向/全量/浏览器验收。报告通过不等于机器自动验证或用户批准。

host审查成员累计819451 total tokens，其中810640 input、720640 cached input、8811 output；cached包含在input中，不重复相加。它是多次请求累计，不是一次提示长度；缺少主线程与对照，不推算费用或提速。

## 验证

| 检查 | 结果与边界 |
| --- | --- |
| 首轮A/B定向 | 45/45与41/41；分别见 `/tmp/teams-upgrade-a-20261015.log`、`/tmp/teams-upgrade-b-20261015.log` |
| 最终定向 | 90/90，15531.48475ms，六个相关文件；`/tmp/teams-upgrade-070-targeted-final-20261015.log` |
| 最终完整npm test | **334/334**，0 fail/cancelled/skipped，93357.435333ms；Node v24.21.0/macOS arm64；`/tmp/teams-upgrade-070-full-final-20261015.log` |
| 最终候选SDK | 24源码及skill/PRINCIPLES/package/兼容manifest逐字节相同；8工具/必填workspace、选定1/项目13、监听退出；固定样例summary1019/catalog3750 UTF-8字节 |
| 最终doctor | 官方模型/强度、plugin发现、readOnly/network=false/approval=never线程检查通过，无推理 |
| 最终官方临时宿主 | smoke-plugin通过缓存独立、skill/8工具、三个hooks发现、双项目、无绑定拒绝、owner退出；未执行真实桌面按钮 |
| 官方CLI临时更新 | 25次CLI调用，首次安装/替换/受控失败后旧缓存身份恢复通过；临时home清理、正式配置未改 |
| 实际浏览器 | 25条切换/历史/搜索/刷新条件保持；80条连续20→40→60→80；合成服务停止后确认断连旧记录提示，临时测试页/服务关闭 |
| 最终候选真实写闭环 | writer+fresh expert reviewer，66.893秒；3项命令断言前后通过，HEAD/index/已有改动保持，显式集成无commit，managed worktree移除 |

查阅 [官方MCP 2025-11-25 tools规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)，继续使用官方SDK注册JSON Schema工具和现有text回执；公开合同通过本机SDK与临时宿主核对，没有手写协议实现。

临时CLI检查保留失败历史：首轮验证脚本未归一化/tmp与/private/tmp，路径断言失败；第二轮严格要求内容恢复，暴露list无installedPath而只能恢复元数据。修正验证脚本与生产路径处理后通过。日志分别为 `/tmp/teams-upgrade-070-update-real-20261015.json`、`/tmp/teams-upgrade-070-update-real-final-20261015.json`、`/tmp/teams-upgrade-070-update-real-passed-20261015.json`，没有覆盖失败记录。

## 真实写证据

复用smoke-write-live，只将四个生产模块导入改指最终候选。模型均为krill/gpt-6.1-sol/high，未增加其他模型或自动重试。

- task `7ca3c6f4-c8a6-4e43-8e43-073ee1433d51`。
- writer线程 `01a13d95-c49e-71c1-91a9-a2f21f383227`，reviewer线程 `01a13d96-5025-7072-9438-c6f79c105dac`，线程不同、独立审查passed、退出确认。
- `.codex-teams/live-write-77d3b837-8850-4636-84bb-7031621ff4f2/` 含报告、workspace、patch、前后原始日志和acceptance；它是Git忽略的本机证据。本轮按任务需要读取该明确目录，没有扫描其他ignored数据。
- writer累计45839、reviewer45613 host total tokens，仅表示本次功能验收用量；小型已知任务通过不代表复杂任务效果或提速。

## 候选、交付与下一步

最终候选 `dist/marketplace-v0.7.0-verified-20261015`，digest `912d87efb306ed4dba07f9dc59b9e9db35a8385637b59989b44bddeaa7d9bc03`。较早candidate保留，不作为最终交付；dist被Git忽略。本轮没有运行正式update，当前聊天加载0.6.3不会热更新，旧页面也不会自动更新。

下一步结束有关Team会话后，按README显式update并重开新会话，核对实际来源/版本/schema。真实桌面停止需要独立测试会话，当前未测；远程矩阵需承载当前源码的授权交付，未提交/推送前不触发旧HEAD冒充验证。效率对照需先限定样本与预算。持久归档、自动会话识别、工具白名单、发现摘要、并行写与磁盘清理后置。

本轮新增代码/测试/文档未暂存，原index tree `c6e7b068a73edc1313595a53c7872413f0bf172f` 保持，HEAD不变，无跨worktree未同步内容。未commit/push、正式安装、历史清理或替用户信任hooks。最终文档格式/链接/版本/index核对记录于STATUS。
