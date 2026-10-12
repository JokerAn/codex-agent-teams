# 当前状态

日期：2026-10-12（Asia/Shanghai）。版本：0.2.0。**本机首版可用：只读委派和写任务交付闭环已实现并实测。**

## 已交付

- 任务合同、明确依赖、默认 expert/资格模型限制、显式强模型重试（最多三次）。
- SQLite 唯一 owner、attempt 迟到门禁、事务关联、截止时间/取消和不自动重放的崩溃恢复。
- 只读与写任务使用官方 App Server 新线程；不复制父聊天，不自动启动递归团队。
- Git 真实基线、显式 dirty snapshot、独占 detached worktree、文件/路径审计及保守清理；保留原 HEAD/index/用户文件。
- 显式 command+args 验证，有上限原始日志、退出码/信号、timeout/cancel/进程组退出确认。
- 写任务候选 patch/hash、全新 expert/read-only 审查线程、captain 逐项验收、当前 patch/文件/日志核对。
- captain 通过后 awaiting_integration，显式集成保持源 index/HEAD，源验收命令再次通过才 succeeded、解锁依赖。
- source drift/冲突拒绝应用；集成后失败/取消/crash 保留 source 变化并标 integration_failed，不自动回滚/reapply。
- 七个 MCP 工具、CLI create-by-run/start/status/review/integrate/cancel/workspace、skill 与本机 marketplace 包。
- 版本升级到 0.2.0，保留旧 P0 合同与 v1 SQLite；没有新增运行依赖、框架、前端或守护进程。核心仍为 11 个 JS 文件。

## 当前验收证据

| 要求 | 当前证据 |
|---|---|
| 合同、依赖与队长门禁 | tests/core.test.js；写任务在 awaiting_integration 时依赖仍拒绝启动 |
| 单个 attempt 的基线/工作区/日志关联 | tests/attempt.test.js：新目录重试、旧回执拒绝、关联事务失败回滚、crash 恢复 |
| 原工作区与 index 保留 | tests/workspace.test.js、tests/write.test.js；真实模型 smoke 比对原 HEAD/index 字节及用户 staged+unstaged 文件 |
| 路径、patch、命令和证据完整性 | tests/attempt.test.js、tests/write.test.js：源/HEAD drift、ignored 越界、文件/日志/patch 改动、命令替换拒绝 |
| 超时/取消/孤儿保守恢复 | tests/verification.test.js、tests/write.test.js：强杀、残留子进程、组信号拒绝 fallback、活旧组拒绝接管、不 kill/replay |
| 启动身份尚未写入的极早崩溃 | tests/backend.test.js 证实 spawn 前落盘 phase/cleanup 后 exited；tests/write.test.js 证实未知 PID 的启动拒绝恢复/重派 |
| 独立强模型审查 | 真实 writer/reviewer 均 gpt-6-astra、threadId 不同；review passed；模拟 reviewReject/reviewMutate/reused-thread 会失败 |
| 显式集成和源复验 | 真实模型 smoke；tests/write.test.js 的二进制/删除、源 drift/index drift、复验失败/取消/应用后 crash 保留现场 |
| MCP 产品入口 | 官方 Client SDK stdio 七工具，受控 writer/reviewer + 真实命令 + review/integrate/cleanup 完整测试 |
| 官方宿主插件安装/skill/工具发现 | smoke-plugin.js：临时 CODEX_HOME 真实 CLI 安装，删除源包后缓存 skill 与七工具仍可见，实际工具调用和 owner 退出 |
| 本机沙箱实际强制行为 | smoke-sandbox.js：临时 linked worktree 内写入成功；源/外部/Git 元数据写拒绝，local network 拒绝，无推理 |
| 本机 App Server 写权限兼容 | 本机 generate-json-schema 和 thread/start 实测 workspaceWrite、writableRoots=[]、network=false、临时目录排除、approval=never；协议异常 echo 拒绝 |
| 小而精干与成熟依据 | 11 核心文件，ESM 无构建，官方 SDK/Zod/内置 SQLite；ARCHITECTURE.md 说明官网、Codex、Execa、Symphony/Git 的具体取舍 |

**最终完整回归 119/119 通过，101.78 秒。** 完整输出保存在 `.codex-teams/final-tests.log`。核心覆盖 22 项 attempt、24 项 Git/worktree、16 项命令/故障、22 项写任务/审查/集成，以及合同/协议/SDK/插件测试。

全量回归最终结果见 `.codex-teams/final-tests.log`（本机保留，Git 忽略）。`npm test` 只执行自动化/受控协议/真实本机命令，不调用模型。模型测试和官方宿主集成单独运行，不混称。

## 真实模型写闭环（2026-10-11 UTC，2026-10-11/12 本地开发期间）

命令：`node scripts/smoke-write-live.js --model gpt-6-astra`，已成功。

- 临时小型 ESM 仓库，sum 错误实现、正/负/零三项断言；源另有 staged+unstaged 用户文件。
- writer 在独立 worktree 改 sum.js，命令 3/3 通过，fresh expert reviewer 实际审查通过，captain 核对后显式集成，source 3/3 再通过。
- 最终 succeeded，HEAD/index 原字节保持，用户 staged+unstaged 内容保持，worktree/临时 fixture 已清理。
- writer thread：`01a12ba3-883d-7730-bd5d-5312176e332d`；reviewer thread：`01a12ba3-f910-71f3-b9e5-37d69679c0c1`。
- 总耗时 61,438 ms。host 报 writer 33,944 total tokens，reviewer 21,173 total tokens；只是这一轮，不计算价格、不声称节省。
- 证据目录 `.codex-teams/live-write-60ebb365-1931-482d-8f94-ed4e0fc2c9bd/` 包含 task.json、workspace.json、binary patch 与前后 stdout/stderr。
- 此次证明真实执行链路，不代表复杂任务准确率、和其他团队方案的对照结果或自动成本路由资格。

此前只读真实 smoke 和临时 SDK/MCP 26 项测试链路也通过；本轮写模型验收是可用性新增证据，没有以协议 fixture 替代真实推理。

## 最终本机产物

- `dist/marketplace-v0.2.0/` 为最终包，root/兼容 manifest、package/lock version 均为 0.2.0。
- doctor 已从包内启动并通过本机 model/effort、plugin skill/MCP 发现、readOnly/network=false/approval=never 检查。
- 官方 SDK 实际连接包内 stdio，七个工具可见；逐文件比对包内 11 个核心源码与项目源码，只有生产依赖，没有测试/状态库。
- 最后一次 smoke-plugin/smoke-sandbox 均通过：缓存 skill/七工具、命令调用、owner 退出，文件/网络 syscall 限制，均无推理。
- 真实模型证据目录的 patch、前后日志摘要再次核对，任务 succeeded、review passed、integration passed、fresh reviewer thread、临时 fixture 已删除。
- Git worktree list 只剩原工作区，refs/codex-teams/workspaces 无残留。源码与文档按用户明确指令提交并推送至现有私有仓库；未发布、未安装到用户配置。

## 环境与使用边界

- 本机 Node v24.21.0、macOS arm64、Apple Git 2.54.0、Codex Desktop/CLI 0.147.0-alpha.6.5。完整 Linux/其他宿主/Node 次版本矩阵未跑；doctor/权限检查不符会拒绝启动。
- 发布/推送、安装到用户 Codex 配置、桌面 UI 操作没有代执行。产物是可安装的本机配置包，临时宿主实际安装已验证；用户正式安装命令见 README。
- 依赖、ignored 文件和环境不随 Git snapshot 复制，不自动联网安装；允许范围是审计交付门禁，worktree 沙箱由宿主强制。
- 进程组无法覆盖主动创建新 session 的程序；PID 复用保守拒绝，启动前已持久记录 launch phase；极早崩溃尚无 PID 的未知 launch 拒绝接管/重派，需人工核对，不自动假定退出。不承诺恶意进程/仓库隔离或所有平台。
- Git submodule/sparse/unmerged/外部 filter/越界 symlink 拒绝，文件/日志/patch/packet 有上限；详见 WORKSPACES.md。
- worktree/写计划任务串行，普通只读默认并发 2/最大 4，一个 workspace 一个运行时；没有自动 DAG 派发、父聊天唤醒或跨厂商后台协调。
- captain-attested 保留真实含义，完整模型质量/效率/费用对照是 ROADMAP 后续，不以一次 smoke 假装完成。

## 文档维护（2026-10-12）

- README 新增“升级代码后重装插件”：版本同步、新目录打包/doctor、任务退出、插件卸载、marketplace 来源切换、重装/重启和手工 MCP 区别。
- 依据本机 CLI help 和上一轮临时 CODEX_HOME 实测：0.2.0 → 0.2.1 来源切换与重装成功，没有推理或用户配置改动。
- 本轮只改文档，检查 Markdown 代码块/命令及 git diff --check；未重跑代码测试或执行正式卸载安装。下一步仍按下文使用及评测路线推进。

## GitHub 交付（2026-10-12）

- 用户明确要求提交到现有私有仓库 `JokerAn/codex-agent-teams`，分支 `main`。
- 本次交付包含 0.2.0 写任务闭环、测试/实测脚本、使用文档和 README 升级重装说明；版本与 lockfile 一致。
- 提交前检查 diff 格式、凭证格式及忽略边界；`teams.local.json`、`dist/`、`.codex-teams/` 不进入提交。
- 沿用最新完整 119/119 通过记录；此后的 README/状态文档补充不改变运行代码，未重复发起模型或全量测试。
- 推送完成后的提交哈希与本地/远程一致性在聊天交付中报告。

## 下一步

已达到本机可用目标，使用方式以 README 和 skill 为准。后续依据真实任务推进 P2 质量/效率评测及版本矩阵；保持小型单链路，不为了角色、界面或模型分层预铺框架。
