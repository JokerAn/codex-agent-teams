# 升级评估（2026-10-12）

依据 PRINCIPLES.md，以准确率和完成效率优先。评估对象为当前 0.2.0 源码；本轮只新增评估记录，不修改运行代码，不代表下面的修复已经实现。

## 后续实施进度（0.2.2）

用户随后把“知道插件是否工作”作为优先需求。0.2.2 已补前台技能反馈、阶段时间线、无 owner 状态观察、版本/来源分离及可交互的本地 HTML 快照；147/147 最终回归、浏览器交互、临时宿主缓存 overview 与修复后的独立复核通过。状态入口不是自动更新的网页或宿主原生 UI，正式缓存尚需重装。最新证据见 STATUS.md。

## 后续实施进度（0.2.1）

本页下文保留升级前 0.2.0 的评估证据与建议。用户随后授权实施，0.2.1 已完成三个边界修补、离线 CI 配置、覆盖率命令及共享版本元数据；本机 138/138 回归、实际宿主无推理检查与团队独立审查通过。远程矩阵尚未执行，环境预检、阶段指标与同条件质量评测仍未实现。最新证据以 [STATUS.md](STATUS.md) 为准。

## 本轮证据

- 队长实跑 `npm test`：119/119 通过，fail/cancelled/skipped 均为 0，耗时 108176 ms。完整本机日志：`/tmp/codex-teams-upgrade-audit-tests-20261012.log`（临时文件，不保证长期保留）。
- 一个 expert 只读团队任务审查 runtime/store/app-server；队长检查原始源码、相关测试并独立复现三个边界后逐条通过。任务 `4616f35d-faa3-46ce-9368-ad68b27802bb`，attempt `59b2839b-232f-4c3b-8ddc-0c92fabbda08`，状态 succeeded，仅表示审查报告通过。
- 三个边界采用内存 store、请求桩及从当前源码提取的解析回调验证，未实例化第二个 TaskStore、未启动真实模型，不能代替真实宿主异常或内存峰值实测。
- 环境行为使用临时 Git 仓库和真实 GitWorkspace prepare/remove 验证；fixture 不调用模型，退出后已清理。
- 团队成员本身是真实 `gpt-6-astra/high` 执行。成员启动至队长通过为 03:13:25–03:19:40 UTC，约 375 秒；这是含队长复核的墙钟跨度，不是成员纯推理时间。host 报告 totalTokens=605677、inputTokens=599092、cachedInputTokens=547072、outputTokens=6585，缓存包含在输入中，不重复相加。未计算费用或声称节省。

## 优先修补的三个边界

### 1. 重试的执行信息归属

证据：`src/runtime.js:50` 开始新 attempt 仅清除 result/review/error；`:125` 返回有效结果前失败时不更新 execution；`:135` 合并 payload 后旧顶层 execution 仍可能存在。

复现：首轮返回 threadId=old-thread，队长拒绝，第二轮显式重试抛错；状态 failed、attempt 数量 2、当前 attempt.execution 为空，但 task.execution.threadId 仍为 old-thread。

影响：状态和 thread/model/usage 显示可能属于不同 attempt，误导排障与用量归属。未发现因此绕过已有验收门禁。

建议：新 attempt 清除 execution，或顶层信息始终派生自当前 attempt；旧 attempt 保留历史。验收覆盖第二轮抛错、取消及结果格式不合法，确认顶层不残留旧执行信息。

已有测试：`tests/core.test.js:36` 和 `tests/attempt.test.js:145` 覆盖重试、新工作区和旧回执拒绝，尚未断言失败重试的顶层 execution 归属。

### 2. 只读成员和 reviewer 的实际目录

证据：`src/app-server.js:132` 仅为 workspace-write 核对 realpath(started.cwd)；只读分支只校验 sandbox 类型。独立 reviewer 同样使用只读模式。

复现：请求项目目录，桩返回 cwd=/，其余 model/readOnly/network=false/approval=never 正确，当前函数接受响应。这证明校验缺口；没有证明真实宿主曾返回错误目录。

建议：依据目标本机 schema，为两种模式统一检查返回 cwd。验收覆盖错误/缺失 cwd 在 turn/start 前拒绝、正常目录及 symlink 等价路径通过、错误后清理完成。对应 fixture 的只读响应当前也需要补齐 cwd。

已有测试：`tests/backend.test.js:26` 验证权限不符拒绝；`tests/attempt.test.js:43` 验证传给 backend 的目录；两者没有验证宿主返回目录不符。

### 3. 致命协议错误后的输出缓冲

证据：`src/app-server.js:30` 的局部 buffer 在 data 回调中先追加，再检查 16 MiB；`:44` 的 fail 拒绝 pending/发送 fatal，但没有停止 data 解析或释放 buffer。

复现：首次无换行输出 16777217 字节触发超限后，再追加 1 MiB，buffer 增至 17825793 字节。尚未测量真实进程中的内存峰值或取消延迟。

建议：首次 fatal 后停止解析、释放缓冲，并选择关闭输入或继续丢弃后续字节以排空管道；保留现有 TERM/KILL、退出确认及并发占用门禁。验收用受控 fixture 持续输出且忽略 TERM，确保缓存不再增长、不会分发通知、进程确认退出后才释放容量。

已有测试：`tests/backend.test.js:26`、`:34` 覆盖协议错误/崩溃/超时/取消及清理，未覆盖超限后继续输出。

## 升级顺序与验收

| 顺序 | 建议 | 价值与最小交付 | 验收 |
|---|---|---|---|
| P1-1 | 上述三项正确性修补 | 保持单链路，小范围修改 runtime/app-server 与对应测试 | 定向回归和全量离线测试；权限响应修改以本机 schema 核实 |
| P1-2 | 执行环境预检与证据 | 在调用 writer 前检查必要运行时、依赖及本地数据；记录工具版本、锁文件摘要和依赖来源；先检查，环境准备另设显式合同 | 可区分环境不足与代码错误；环境证据变化可见；缺环境时不先消耗 writer/reviewer；不隐式联网安装 |
| P1-3 | 自动 CI 与宿主兼容回归 | macOS/Linux + Node 24 的离线测试、生产依赖封装检查；具备 Codex 的受控环境另跑无推理协议/沙箱 smoke | 干净 checkout 可复现；普通 PR 不调用付费模型；不具备宿主的 runner 明确标未验证；报告分支覆盖率 |
| P1-4 | 阶段用量与错误分类 | 利用已有 attempt/verification/review 数据，区分合同、环境、模型、协议、集成失败；记录准备、成员、验证、审查、集成用时 | 状态能给出当前阶段、可核对证据及下一步动作；按 attempt 汇总并保留 usage 未知，不合并错误归属；无需前端 |
| P2-1 | 同条件质量/效率评测 | 先选约 10 个真实且边界清楚的任务，固定基线、验收、模型能力和权限；比较单强模型、原生子 Agent、当前插件 | 记录正确率、严重缺陷、总耗时、返工与人工介入，再看费用；小样本仅作初步证据，不据此自动降级；OMX 可随后加入 |
| P2-2 | 版本与插件来源可追踪 | 统一版本元数据；打包生成源码/依赖/配置的适当摘要与构建信息；doctor 展示源码和当前运行包来源；配置摘要避免泄露敏感值 | 故意制造版本不一致时拒绝；缓存运行能追溯构建；重装不需要逐个文件人工比对；安装仍由用户授权 |

环境建议的具体依据：`src/workspace.js:103`、`:130` 仅捕获 Git 基线，忽略文件不复制；`src/verification.js:59` 保留部分宿主环境，仅剔除特定变量；`examples/write-task.json` 使用 npm test 且不安装依赖。临时仓库实测 source 与 worktree 的 import 均解析到源仓库 node_modules，但 worktree 缺少 ignored 的 data/runtime.txt。因此不能把“依赖没复制”简化为“一定不能运行”，也不能把 Git 内容指纹当作完整执行环境指纹。先记录与预检，是否冻结环境由真实复现需求决定。

CI/评测建议的依据：仓库目前没有 `.github/workflows/` 或独立 benchmark/evaluation runner；`package.json` 仅 test/doctor/mcp 三个 scripts。既有真实写 smoke 证明可用链路，但不证明复杂任务质量或对照优势。

版本建议的依据：`README.md:69` 要求同步 package/lock、两个 manifest、MCP/App Server 元数据；`src/plugin.js:32` 检查 manifest/package，但未统一所有元数据或展示源码与已安装缓存的构建对应关系。当前源码和插件版本均为 0.2.0；没有证据证明存在实际缓存过期。

## 建议的版本切分

- **建议 0.2.1**：先修三个边界，补离线 CI 与必要分支回归；版本仅是计划，当前仍为 0.2.0。
- **建议 0.3.0**：执行环境预检、阶段指标及结构化排障；形成可重复的评测样例与报告，再根据结果决定扩展。
- 写任务并行、共享 owner、更强孤儿进程身份和环境冻结，都应由实际阻塞与指标触发；当前不把它们列为本轮前置条件。

## 官方依据与未验证边界

2026-10-12 核对官方 Codex App Server 文档：CLI 可生成与实际 Codex 版本对应的 JSON Schema/TypeScript schema。建议兼容回归同时保留本机 schema 与实际协议 smoke，不能只跟随网页示例。官方 Node 文档提供内置 test coverage，覆盖率用于定位分支缺口，不作为正确性证明。

未执行真实 writer/reviewer 写任务、跨平台矩阵、复杂任务对照、真实宿主错误 cwd、真实输出洪泛峰值测量或插件重装。以上建议均未在本轮实现，运行代码未变。
