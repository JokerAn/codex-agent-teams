# 0.8.4 覆盖率补修与原生派发复核（2026-10-17）

本轮继续修复 0.8.4 的遗留验收问题，版本仍为尚未发布的 0.8.4。源码目录 `/Users/anshunli/单纯回话/codex-agent-teams`，基线 HEAD `6d263a8670c32e24005a2f893087324531ca91cf`，原 35 个暂存 readiness 证据保持。本轮未修改生产 src、模型配置或正式插件安装；修改集中在测试隔离、回归和 CI。

## 故障机制与实验证据

旧 CI 出现“测试全部通过、coverage JSON 解析失败、命令 exit 1”。本轮在 macOS/Node24.0 原样全量 coverage 428/428、Ubuntu24.04 arm64/Node24.0 原样全量 coverage 427/427 均通过，因此不能将故障简单归为最低版本不支持，也没有复原旧 CI 的具体故障 PID。

最小实验使用真实 Node24.0 子进程，监听其覆盖率文件创建，并在 V8 写入期间 SIGKILL。测试本身 1/1 通过，截断 JSON 随后使 coverage 归并 exit 1，重现了同类故障机制。测试 runner 会把覆盖率目录通过 NODE_V8_COVERAGE 传给所有后代，其中包含不属于被测生产代码的协议、空转和验证命令 fixture；它们刻意 crash/kill 时不应向生产覆盖率输入目录写入文件。

对照实验继续保留未隔离路径：未隔离时测试通过而 coverage 失败；启动前隔离后测试和 coverage 都通过。没有删除损坏 JSON、忽略覆盖率错误或改变生产命令的退出语义。可复跑入口：[负对照脚本](evidence/coverage-0.8.4-2026-10-17/reproduce-coverage-write-race.mjs)。

## 最终修复范围

- `tests/fixtures/coverage.js` 提供启动前隔离：克隆环境、通过 env 启动纯 Node 命令，以及生成先 unset 后 exec 的协议 fixture 启动器。导入 helper 无副作用，调用者环境不变；路径和参数包含空格、单引号时按原字节传递。
- 纯协议后端、空转后代和纯 verification 脚本在启动前退出覆盖率采集。真实外层 process-guard、CLI、MCP、runtime 及包含生产 preflight/verification 的混合启动器保留原采集路径。
- 新增 9 项回归，包含真实生产 profile 的正对照、纯 fixture 无 profile、退出码 0/7 的精确 stdout/stderr、二进制输出、子孙环境以及生成脚本的路径/argv 引号处理。
- timeout 测试增加 handler-ready 和 TERM-observed 证据；使用足够启动预算后仍验证真实 TERM→KILL 升级，避免在 handler 未执行时误把提前 TERM 当成目标用例。
- CI 的功能与 coverage 各自恢复 Ubuntu/macOS × Node24.0.0/24.x 四组，不再排除最低版本的 coverage。真实生产覆盖率输入损坏仍应使检查失败。

曾尝试在 fixture 进程正文调用 v8.stopCoverage()。虽然能停止写文件，Node24.0 在部分退出路径会向 stderr 写入 profiler 诊断，完整回归检出了字节污染；该方案已移除，相关失败不计为最终验收通过。最终实现完全在纯 fixture 启动前处理。

## 测试数量口径纠正

`tests/verification.test.js` 按 Darwin 条件注册一项 macOS 信号回退测试，因此同版本 macOS 比 Linux 多一项。旧 412/411 及本轮修前 428/427 都是正常的平台差异，不能据此推断 Ubuntu 漏执行。原失败来自 coverage 报告；修前评估中的数量疑点已更正，既有暂存原始日志未改写。

## 原生派发与交付边界

只读代理记录显示，前轮 404 后相同请求模型已有 200；复用原生成员也完成了实际审查与代码任务。模型、provider 和代理配置未更改，没有把改模型当成路由修复。本轮可确认当前派发已恢复，不能保证外部服务永久不再 404，也没有精确底层模型/费用回执。

成员完成了首轮 helper 和回归，后续修订由主线在关闭成员、收到 shutdown 后接手复核与集成。最终成功与否以主线统一执行的四组回归为准，不把中途关闭的任务标为已验收成功。

所有覆盖率及协议回归均使用本机/本地 Ubuntu VM、临时目录和受控协议 fixture，不调用真实模型服务；原生成员用于用户授权的实际协作任务，没有另做模型费用或效率基准。没有提交、push 或触发更新后的 GitHub runner，远程验收仍需在对应提交上运行。

## 最终本地验收

| 本地平台 | Node | 功能及覆盖率 | 行 / 分支 / 函数覆盖率 | 耗时 |
| --- | --- | --- | --- | --- |
| macos | 24.0.0 | **437/437，exit 0** | 97.40% / 90.01% / 95.06% | 171.140s |
| macos | 24.21.0 | **437/437，exit 0** | 97.40% / 89.83% / 95.06% | 194.429s |
| ubuntu-24.04-arm64 | 24.0.0 | **436/436，exit 0** | 97.40% / 89.83% / 95.06% | 75.090s |
| ubuntu-24.04-arm64 | 24.21.0 | **436/436，exit 0** | 97.40% / 89.87% / 95.06% | 57.906s |

四组均 0 fail/cancelled/skipped。Ubuntu 是本地 Colima VM 的 Ubuntu24.04 arm64，不能表述为 GitHub hosted runner 已通过。覆盖率范围仍是 src/*.js；测试脚本与隔离 helper 的行为由真实子进程回归和负对照另行验证。

本轮主线另跑 macOS 定向 28/28、Ubuntu/Node24.0 coverage 定向 78/78。所有最终检查都使用启动前隔离方案；中间被淘汰方案的失败日志保留用于说明 stderr 回归。原始终端日志的仓库副本仅移除了行尾空白，原路径和 SHA256 见[结构化证据](evidence/coverage-0.8.4-2026-10-17/results.json)。

源码仍为未发布 0.8.4，本轮只改测试、CI 和说明，生产 src 及 native 的 metadata/skill 内容未变，既有 native 候选资产继续保留。实际交付当前主目录，源码和本轮文档/证据未暂存，原 35 个暂存证据和 HEAD 保持；没有跨 worktree 未同步内容，没有 commit/push 或正式 update。真实桌面停止、精确模型/强度/费用及效率对照未新增验收。
