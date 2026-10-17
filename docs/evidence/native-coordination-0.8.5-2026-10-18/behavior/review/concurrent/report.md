# 单场景：验证期间输入被改写，稳定后定向复验

## 交接决定

采用当前 `skills/team/SKILL.md` 中的规则：**If related inputs change during a run, its result cannot represent a stable snapshot; rerun the affected scope once inputs settle.**

- 正式并发轮：验证命令退出码 0，实际 1/1 通过，但相关输入 input.json 的 SHA-256 改变，且 IPC 证实改写发生在验证进程读取之后、断言与退出之前。判为 **HOLD**，不能复用为当前输入的有效交接证据。
- 稳定复验：先确认写入子进程已 close、退出码 0，再启动复验；不再启动 writer。相同用例实际 1/1 通过，五个相关输入前后指纹一致，读到新输出 `Record: b`。判为 **仅本独立样本 ACCEPT**。
- 原 exercise 的 provider/card/list 阻断项不在本次范围内，原交接 HOLD 决定不变；不推断主项目完整集成或构建通过。没有执行主线正在排查的旧截止时间测试。

## 样本与显式握手

代码仅有 card.mjs、validate.mjs、mutate.mjs、run.mjs 与 input.json。没有依赖安装、agent 或外部服务。run.mjs 是单一协调进程；验证和写入由真实 Node 子进程执行，IPC 是进程间握手，不是真实团队任务消息。

validate.mjs 使用 node:test 实际执行一个用例，读取 JSON、算出 `Record: a`，发送 `input-read` 后阻塞等待 `resume`。协调进程此时才启动 writer；收到 `writer-ready` 后发送 `mutate`。writer 核对修改前指纹，写入 b，发送 `mutation-done` 并退出。协调进程等到 writer 的 close 才恢复验证进程。用例使用已读取的输入继续断言，因此并发轮可以绿测，却没有验证盘上新的 b 输入。

复验不重置输入，不重写代码，不启动 writer；启动前要求五个输入全部等于上一轮 after 指纹。10 秒超时仅用于握手失败时终止，没有用固定等待时间触发竞态。全部有效轮次的握手、PID、单调时钟及墙钟在 [evidence.json](evidence.json) 中，验证命令结束以真实 child close 为准。

## 命令、退出码与用例数

运行环境 Node v24.21.0，可执行文件 `/Users/anshunli/.nvm/versions/node/v24.21.0/bin/node`。下表 cwd 均为本 concurrent 目录。验证子进程命令由 run.mjs 用 fork 建立 IPC 通道；直接在 shell 执行 validate.mjs 会因缺少 IPC 而拒绝运行，复现应使用两个 launcher 命令。

| 阶段 | 实际命令 | 退出码 | 实际用例数与结果 |
|---|---|---:|---|
| 并发轮 launcher | `node run.mjs first` | 0 | 协调脚本，不计作测试通过 |
| 并发轮验证子进程 | `node validate.mjs` | 0 | 1 项，1 pass、0 fail/skipped/cancelled |
| 并发轮 writer 子进程 | `node mutate.mjs` | 0 | 不运行测试 |
| 稳定轮 launcher | `node run.mjs stable` | 0 | 协调脚本，不计作测试通过 |
| 稳定轮验证子进程 | `node validate.mjs` | 0 | 同一个用例复验，1 pass、0 fail/skipped/cancelled |

日志是 Node 的原生 `✔/ℹ` 输出，保存在 [first-round.log](first-round.log)、[stable-round.log](stable-round.log)，没有把它们称为 TAP。记录器从日志核对 tests/pass/fail 的实际数量，不靠“进程完成”推断测试跑过。四个 .mjs 的最终 `node --check` 结果见 audit.json；语法检查不计作测试用例。

## 时序依据

下表是 evidence.json 里真实事件的摘录；时间转换到 +08:00，事件序号保留原序。相同毫秒内仍可由事件顺序与单调时钟区分。不同轮的协调进程 PID 不同，不用跨进程时钟计算收益。

| seq | 本地时间 | 事件 | 子进程 PID |
|---:|---|---|---:|
| 2 | 2026-10-18T00:24:02.716+08:00 | validator:spawned | 29329 |
| 3 | 2026-10-18T00:24:02.765+08:00 | validator:message / input-read | 29329 |
| 6 | 2026-10-18T00:24:02.808+08:00 | writer:send / mutate | 29362 |
| 7 | 2026-10-18T00:24:02.809+08:00 | writer:message / mutation-done | 29362 |
| 8 | 2026-10-18T00:24:02.815+08:00 | writer:closed | 29362 |
| 9 | 2026-10-18T00:24:02.815+08:00 | validator:send / resume | 29329 |
| 10 | 2026-10-18T00:24:02.816+08:00 | validator:message / assertion-passed | 29329 |
| 11 | 2026-10-18T00:24:02.821+08:00 | validator:closed | 29329 |
| 13 | 2026-10-18T00:24:17.070+08:00 | before-snapshot | — |
| 15 | 2026-10-18T00:24:17.119+08:00 | validator:message / input-read | 40571 |
| 17 | 2026-10-18T00:24:17.120+08:00 | validator:message / assertion-passed | 40571 |
| 18 | 2026-10-18T00:24:17.126+08:00 | validator:closed | 40571 |
| 19 | 2026-10-18T00:24:17.126+08:00 | after-snapshot | — |

尤其 seq 3 → 7 → 8 → 9 → 10 → 11 证明：先读入旧输入，再改写并结束 writer，再允许断言，最后验证进程退出。这比仅比较命令前后哈希多提供了修改确实位于命令执行区间的因果依据。稳定轮没有 writer 的 spawn/message 事件。

## 前后指纹

| 轮次 | input.json before SHA-256 | input.json after SHA-256 | 结论 |
|---|---|---|---|
| 并发轮 | `011a019ebfe8db9a99a380bad0913980f0a5cf6c9e35f54a6af560345cd7b079` | `2d2e06f1b99f5f7f5adc6c6aec5eec6f241246a6954e0fa72bf1b6f8b14d47a5` | 输入变更，HOLD |
| 稳定复验 | `2d2e06f1b99f5f7f5adc6c6aec5eec6f241246a6954e0fa72bf1b6f8b14d47a5` | `2d2e06f1b99f5f7f5adc6c6aec5eec6f241246a6954e0fa72bf1b6f8b14d47a5` | 一致，本样本 ACCEPT |

card.mjs、validate.mjs、mutate.mjs、run.mjs 的完整前后指纹同样保存在每轮 before/after 中，四个代码文件两轮均未变化。受保护的 exercise 文件（不含 concurrent）与 .git/index、.git/HEAD 也进行了前后指纹核对；没有变更。它们不会因新增本目录而被误判为成员改动。

## 记录器调试失败（如实保留，不计为有效验收）

在上述两轮完整证据之前发生了两次搭建失败，未隐藏或计作额外场景：

1. 首次 `node run.mjs first` 退出码 1：直接 node:test 的原生输出不匹配旧的 TAP 计数解析器，`totals.tests` 为 undefined。按当时代码顺序，验证子进程退出码 0 的断言已经过；但原始 child 输出与时序没有落盘，所以那次实际用例数和握手时序标为**未验证**。见 [setup-attempt.json](setup-attempt.json)。
2. 调整为 `node --test --test-isolation=none --test-reporter=tap validate.mjs` 的搭建尝试没有收到 `input-read`，10 秒失败保护触发，launcher 退出码 1；没有把它当作成功运行。保留的 setup 事件见 [setup-ipc-attempt.json](setup-ipc-attempt.json)。子进程已被终止，后续 `process.kill(pid, 0)` 返回 ESRCH 确认不再存在；没有伪造退出码或实际用例数。

最终恢复已观察可用的直接 node:test 方式，同时解析其实际原生输出，才取得完整的 first/stable 两轮记录。实际 launcher 调用总计四次（first 三次、stable 一次）；不能把未验证的搭建尝试说成零用例，也不能把两个完整证据轮次说成整个过程中唯一的执行。

## 原首轮是否提前交付重要发现

**可观察事实：原首轮在最终答复前，曾向当前用户发出中途 commentary，报告非法 id 违约。** 可核对来源是本聊天中，原 `available-integration` 验证输出之后、生成 handoff-review.md / member-notifications.md / retrospective.md 的工具调用之前的 assistant commentary。原话摘录：

> 当前局部测试为 3/3 通过；新增的可执行集成检查为 5/6 通过。失败项确认了合同问题：`loadRecord(42)` 没有拒绝，而是返回了数字 id。真实 provider 的 found 链路通过，missing 仍待交接，不能据此放行完整集成。

其发现本身可在 [原 verification.json](../verification.json) 的 available-integration 记录（endedAt 为 `2026-10-17T16:14:31.318Z`）及 [原失败日志](../available-integration.log) 核对。这里对聊天的引用是**事后摘录**，不是当时落盘的通知回执；该消息没有在本地提供独立发送时间戳。原 host-records 的 report 事件也没有重要发现内容或收件人。

**是否早于原成员完成、是否实际提前通知到成员：未验证。** 当时用户明确不允许发真实任务消息，成员通知只保存为草稿；没有真实发送/接收证据。本报告不将“最终答复前向用户报告”扩大为“已完成团队成员间提前交付”。

本次并发轮也在 stable 复验启动前向用户发出了中途 HOLD 发现，来源为当前聊天里 first 成功输出后、`node run.mjs stable` 工具调用之前的 commentary；同样没有发送成员消息。

## 范围与限制

只验证这个相关 JSON 输入在读入后、验证结束前被改写的场景；不覆盖修改后恢复原字节、目录替换或任意生产竞态。稳定轮前后哈希仍是端点采样；本场景额外有唯一 writer 已退出、稳定轮不再启动 writer 的控制依据，不声称一般环境已获得文件系统隔离。没有费用、真实账户、模型回执或效率对照结论。

本轮只在 exercise/review/concurrent 内写文件，不更新真实项目 docs/STATUS.md，不修改原 exercise 的成员文件、集成测试或既有报告，不暂存、提交或推送。最终文件清单和语法/范围检查见 audit.json。过程临时文件 failed-run.json 已在本目录重命名为 setup-ipc-attempt.json，未遗失失败证据。
