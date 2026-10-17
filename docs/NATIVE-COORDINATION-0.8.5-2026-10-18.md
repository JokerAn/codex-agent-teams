# 0.8.5 原生协作规则升级（2026-10-18）

本轮根据用户指定的 [改进报告](/Users/anshunli/gitHub/pre-page-error/CODEX_AGENT_TEAMS_IMPROVEMENTS.md) 落实 T01–T06。报告 SHA-256 为 `d313984436737d9b7e422cb46141a38b1510c79fe03c36a4553c33bfb028a520`。开工源码版本为尚未发布的 0.8.4；其 team skill 哈希 `d5b5790832d5359929e78327b1bff61e3d70ad4142b2449020f30ff376c03b33` 与报告所检查的 0.8.3 安装版本一致，因此按当前规则缺口升级，不把历史协作现象解释为当前运行时故障。

## 实际改动

版本在 package、lockfile 根及 packages[""]、两份 plugin manifest 中统一为 **0.8.5**。[team skill](../skills/team/SKILL.md) 保持自包含，默认插件仍为四文件，无新增运行时、依赖、MCP、hooks、任务数据库、统计服务、固定人数或额外确认流程。可选 strict-delivery 的选择与机制保持显式。

| 建议 | 新规则 | 本轮证据及边界 |
| --- | --- | --- |
| T01 验证状态 | 交接附命令、退出码、实际用例数、范围、环境、依赖就绪情况及相关输入前后状态；HEAD 不能代表 dirty files；区分局部、待集成和集成；输入变化后复验，失败有原因与复验 owner | 独立成员发现 card 旧日志后的源码变化并重跑当前局部范围；缺失的 list 命令证据也补齐。补充真实子进程握手演练：验证期间输入被修改，1/1绿测仍HOLD，稳定后同用例1/1复验。主线各轮记录前后74个代码/依赖输入摘要，保留端点采样限制 |
| T02 接口协调 | 有依赖才在派发前约定接口、输入、输出、失败、兼容与 owner；变更通知全部消费者及相关 doubles，同版约定再集成 | 演练识别 provider revision 2、两个消费者仅确认 revision 1，保存分别通知与待确认状态；没有代成员确认或修改 provider。未运行真实三名成员的派发/通知演练 |
| T03 改动归属 | 声明归属是软约定，权限以宿主为准；起始/交接核对实际写入，结合操作与文件证据，不能由整树 diff 推断成员；越界路径停写并协调，保留他人内容 | 演练通过 operation 与 diff 识别 provider 格式化 banner 越界，区分 lead 的 notes 改动，保留现场；主线核对开工工作树与暂存区。未宣称文件写入隔离或自动拦截 |
| T04 验证分工 | 成员优先局部检查，具名 owner 负责全量/最终构建；扩大范围说明理由；共享输出/端口串行，适用输入与环境未变才能复用结果 | 样本保留 lead 全量与构建责任，没有把 double 当真实 missing，也没有虚构缺失 build；主线在首次全量失败并修订测试后重新全量，原因和原失败保留 |
| T05 审查时机 | 有必要时从可检查接口/首批实现开始并行；可复现重要发现提前报告，确认/推测/待验分开；限定范围和结束条件 | 独立成员发现样本的 truthy 非字符串输入违约并保留失败，主线复核测试与原始日志；成员材料保留最终答复前进展commentary的事后摘录，但没有独立收取时戳或真实成员收件回执，不标记队内提前通知已通过 |
| T06 轻量复盘 | 用户要求时复用宿主现有记录，来源可追溯、缺失标未知；分清请求、调用参数与实际回执；累计/增量和父子归属未清前不相加，不推算费用或净收益 | 独立成员对受控 parent 1000/1500、child 600 记录没有求和；保留实际模型/effort、等待与完成未知，不把成员时长总和当节省时间。没有新增自动采集器 |

README 和 [场景验收](TEAM-SCENARIOS.md) 同步说明日常用法、六项验收及各类证据边界。官方 [Build skills](https://learn.chatgpt.com/docs/build-skills) 已查阅；本轮未新增公共 API 或修改宿主协议。

## 独立前向演练

主线负责 skill、版本、打包及最终验收；一名原生评估成员在独立临时样本中接手 provider/card/list 交接，主线继续推进打包与回归。派发参数为 `fork_context:false`、`reasoning_effort:high`，未覆盖模型；这些是请求参数，不代表宿主确认了实际模型/effort。复用同一成员补充场景，不启动其他成员或外置执行器。

样本刻意保留未完成 provider、消费者旧确认、过期绿测、formatter 越界及不完整用量记录。成员仅有 lead 集成测试和报告的写入范围，主线复核其集成测试、日志、通知与状态记录，确认没有改写成员文件。第一轮局部检查 **3/3 通过**；部分集成 **6 项中 5 通过、1 失败**，失败是 `loadRecord(42)` 未按合同拒绝，正确保留 **HOLD**。真实 missing 依赖未完成，两项相关测试没有执行，不能把过滤后 skipped=0 解读为已运行。该样本的失败是演练发现，不是本项目回归失败，也未为制造全绿修改样本 provider。

补充演练用真实验证/写入子进程和IPC握手，在读入a之后、验证退出之前写入b；并发轮虽1/1通过，因相关输入变化判HOLD，writer退出且输入稳定后同用例1/1复验才接受此独立样本。主线复核事件顺序3→7→8→9→10→11、子进程exit0及前后指纹。记录器搭建期间两次失败已保留，未计作成功；详见 [并发报告](evidence/native-coordination-0.8.5-2026-10-18/behavior/review/concurrent/report.md) 与 [全部演练材料](evidence/native-coordination-0.8.5-2026-10-18/behavior)。成员已关闭。受控样本用于检验交接判断，不能替代真实多人并行、桌面停止、同文件写入冲突、模型实际回执或同范围质量/效率/费用对照。没有可比单代理基线，不宣称净提速或降本。

## 全量回归暴露的测试时序问题

首次 `npm test` 实际 **437 项，436 通过、1 失败，exit 1**。失败位于 `tests/attempt.test.js` 的任务截止时间用例：预算 3000ms 包含同步 worktree 准备；若准备已耗尽预算，运行时正确超时且没有创建 verification，旧测试仍读取 `workspace.verifications[0]` 而抛 TypeError。

在临时副本的 `prepareWorkspaceRecord` 后受控阻塞 **3100ms**，稳定复现同类错误，日志明确 `verificationCount:0`；这证明“进入命令阶段”的测试前提不成立。只修订该用例：给予准备阶段充足预算，截取真实任务截止回调，等待有 verification id 和存活的真实命令进程后触发；保留 timed_out、错误码/指引、cancelled receipt 与 cleanupConfirmed，并增加 receipt 绑定和进程退出检查。运行时代码未改，原有“准备耗尽截止时间不启动成员”的用例保留。

修订后截止时间/绑定命令定向 **3/3 通过**；相同 3100ms 延迟的临时副本 **1/1 通过**，仍由截止回调取消实际绑定命令。参见 [原失败](evidence/native-coordination-0.8.5-2026-10-18/full.json)、[修前受控复现](evidence/native-coordination-0.8.5-2026-10-18/deadline-before.txt)、[修后定向](evidence/native-coordination-0.8.5-2026-10-18/deadline-focused.json) 和 [同延迟复验](evidence/native-coordination-0.8.5-2026-10-18/deadline-after.json)。没有吞掉失败、删除断言或跳过该用例。

## 验证与候选产物

环境：macOS arm64、Node **v24.21.0**、Codex CLI **0.163.0-alpha.10.2**。依赖沿用现有安装，`npm ls --depth=0` 通过，项目依赖与运行时源码均未增加或变更。

| 检查 | 结果 |
| --- | --- |
| `npm run test:native` | 11/11，exit 0，无 fail/cancelled/skipped |
| 官方 `skill-creator/scripts/quick_validate.py skills/team` | 临时 Python venv 中通过；系统 Python 首次缺 PyYAML 的失败日志保留，仅临时环境安装 PyYAML 6.0.3 |
| `npm test` 最终复验 | **437/437，exit 0**，零 fail/cancelled/skipped；201.166 秒，输入前后摘要一致 |
| 默认 `npm run build -- --out ./dist/releases/0.8.5/codex-agent-teams-native-0.8.5` | exit 0；未执行 npm ci 或正式安装 |
| 版本、解压逐文件一致及内容摘要检查 | 五处版本均 0.8.5；4 文件、7762 字节；源码 skill 与包内字节一致；修改解压副本 skill 的负对照被 sourceDigest 拒绝 |
| `node scripts/smoke-native.js` | 临时官方 home 安装/发现 0.8.5 通过；移除来源后仍发现 skill；插件 MCP/hooks=0，无项目状态/模型推理，临时 App Server 已退出 |
| `node --check tests/attempt.test.js`、`git diff --check` | 均 exit 0；没有新增 lint/typecheck 配置，不把语法检查称为类型检查 |

候选位于 `dist/releases/0.8.5/`，包含 prepared marketplace、`codex-agent-teams-native-0.8.5.tar.gz` 和 `SHA256SUMS`。压缩包 SHA-256 为 `e5c36f1a65686399720c5708281411bbbe0f69d86a90de9d7bbe735b6aada36d`，内容摘要 `b1e5bbdca1ff32e660f8c6fa24500f25519d31538754ca22a9d61328e86b0cd9`。这是本地候选，尚未发布，也没有更新用户正式插件缓存。

本轮完整命令、退出码、实际数量、相关输入前后指纹与环境见 [证据目录](evidence/native-coordination-0.8.5-2026-10-18)。端点指纹相同不能证明期间绝无“改后恢复”，这一限制随记录保留。没有重复运行跨平台/最低 Node/coverage 矩阵；此前 0.8.4 四组合结果是历史证据，不能当本轮 0.8.5 的新结果。严格运行时仅由本地完整回归覆盖，未做真实模型推理或重新构建 strict 发布资产。

## 交付与下一步

实际交付主目录为 `/Users/anshunli/单纯回话/codex-agent-teams`，开工 HEAD 为 `6d263a8670c32e24005a2f893087324531ca91cf`。既有 0.8.4 修复、历史证据与暂存内容保留；本轮源码、文档与新证据未暂存，无其他 worktree 未同步内容。已核对原35个暂存文件的完整diff摘要保持，215个本轮范围外既有文件的内容/模式均未变；元数据相对开工0.8.4仅改版本。详见 [范围保留记录](evidence/native-coordination-0.8.5-2026-10-18/scope-preservation.json)。

下一步由用户按需要更新正式缓存并重开聊天，在真实业务中演练一名提供方与两名消费者的变更通知、同文件交接和提前审查；收集可比较的数据后再评估规则的质量/效率收益。正式安装、commit、push、tag 和发布均另行处理。
