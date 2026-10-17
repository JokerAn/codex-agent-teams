# strict 0.8.3 独立定向验证交接

源码目录：/Users/anshunli/单纯回话/codex-agent-teams
HEAD：6d263a8670c32e24005a2f893087324531ca91cf
执行环境：macOS / Node v24.21.0；未改仓库源码、测试、文档或暂存区，未安装正式插件、commit/push、调用模型或另起网络服务。
产物实际目录：/private/tmp/codex-strict-audit-rGnFTP（/tmp 路径指向同一目录）。

## 发现：P2，崩溃恢复测试清理绕过生产 macOS EPERM 回退，可能遮蔽恢复断言

位置：/Users/anshunli/单纯回话/codex-agent-teams/tests/attempt.test.js:299、:300。
触发条件：macOS 拒绝对旧验证进程组直接发信号，process.kill(-pid,'SIGKILL') 抛 EPERM。
生产/消费链：验证记录写入 childPid → TaskStore 恢复检查 processAlive(pid,true) → 未确认退出则拒绝恢复；生产清理由 src/app-server.js:123、src/verification.js:67 调用 src/process-group.js:10 的 signalGroup。该 helper 在 macOS EPERM 时查询 ps 并逐个核对 pgid 后发信号（:14–19）。测试 :300 却直接 process.kill，未走 helper。
期望：测试清理兼容已支持的 macOS EPERM 分支，并保留恢复断言的原始结果。
实际：当前 HEAD 的远程 macos-14 / Node 24.0.0 在该 finally 抛 EPERM，411 pass / 1 fail；finally 可覆盖 try 中原异常，因此不能由该栈推断 :299 已通过。
影响：该配置崩溃恢复验收证据不完整、CI 失败；未发现它导致运行时错误地确认退出或重派。
复核命令：node --test --test-concurrency=1 /tmp/codex-strict-audit-rGnFTP/eperm-probes.test.mjs
复核输出：eperm-probes.tap，2/2 pass。探针1注入 signal 0 的 EPERM，确认存活判断保守为 true、恢复拒绝、数据库记录未变；移除注入确认 ESRCH 后才能恢复。探针2注入负 PID 信号 EPERM，直接测试式 SIGKILL 确实抛错；生产 CodexBackend.stop 通过真实 ps/逐进程 TERM 杀掉受控 App Server 及 guard，实际组消失后才报告 memberLaunch=exited。
限制：EPERM 为受控注入，实际本机 Node 是 24.21.0；不能认定 Node24.0.0 是远程 EPERM 根因，也没有复现该远程 runner 的具体权限来源。

## 单独的 CI 证据：Ubuntu coverage 报告失败

用户提供的当前 HEAD CI run 38868353331：ubuntu-24.04 / Node 24.0.0 为 tests411/pass411/fail0，结尾 Warning: Could not report code coverage. SyntaxError: Unexpected end of JSON input，随后 exit1。这是 coverage 产物/读取失败证据，不与 macOS 的 kill EPERM 合并，亦不足以定位 Node/V8 根因。
远程日志：/var/folders/fd/kdxbtp2s18g8glq2l7mj82pr0000gn/T/teams-readiness-20261016-BSbVr2/current-head-ci-failed.log:1397
macOS 原错误同一日志 :709，调用栈 :711。元数据 current-head-ci-details.json 的 headSha 与本地 HEAD 一致；两个 Node24.x job success，两个 Node24.0.0 job failure，失败原因分别记录。
复核命令：rg -n -C 8 'kill EPERM|Could not report code coverage|tests 411|pass 411|fail 0' /var/folders/fd/kdxbtp2s18g8glq2l7mj82pr0000gn/T/teams-readiness-20261016-BSbVr2/current-head-ci-failed.log

## 新增假设与实际证据

strict-probes.test.mjs / probes.tap：13/13 pass，16.239s。
1. 新 attempt 正在运行时，旧 onProgress 注入 childPid、review、thread、usage 均未写入；旧 finish 返回 false，旧 review 拒绝；记录 progress-dropped / finish-dropped。src/runtime.js:133、:242、:258。
2. SQL event INSERT 受控失败时，task UPDATE 和 event 均事务回滚，原 pending 状态保留。src/store.js:88、:114。
3. 恢复第一条 running task 后遇到第二条未知 launch，整个恢复事务回滚；第一条仍 running，无 recovered event、无新 owner。src/store.js:27、:35、:60。
4. member 启动身份未知时，failed/cleanupConfirmed=false；重试、无关任务、workspace prepare、重新打开 DB 均拒绝，没有后端重放。src/runtime.js:77、:244；src/store.js:35。
5. writer 的真实本机验证命令已 passed，但 reviewer 启动无 PID 时仍阻止无关任务、删除工作区和重开，未把 writer 成功当整体成功。src/store.js:34；src/runtime.js:243。
6. close 等待延迟后端退出期间保留 DB owner，拒绝第二 owner 和新创建；释放后恢复为 cancelled，只有一次 backend 调用，没有重放。src/runtime.js:500。
7. awaiting_integration 跨重开保留，依赖仍阻断。将 stdout.log 替换为同字节 symlink 仍拒绝集成且 source 未变；恢复普通文件后，显式集成及 source 验证才 succeeded，HEAD/index 字节保持，依赖随后解锁。src/verification.js:12、:19；src/runtime.js:269、:286、:313。
8. 外层 evidence 已核对后、真正 apply 前注入 patch 漂移，第二次证据校验拒绝，integration_failed/source 原内容保留。src/workspace.js:215、:223。
9–13. 只读 thread/start 回执的 network=true、network缺失、approval=on-request、approval缺失、sandbox=workspaceWrite，均在 turn/start 前拒绝；每项 turnStarts=0，真实受控组已退出。src/app-server.js:166、:169。

focused-regressions.tap：13/13 pass，35.336s。仅执行已选 strict 用例：只读成员变更、命令取消、bound command 崩溃、任务 deadline、owner/重开、patch 篡改、源验证失败、应用后 crash、写权限 echo/reviewer只读、活 reviewer 阻断、集成取消和 PID 未落盘的极早 crash。不重复主线全量测试/coverage。

## 完整复核入口与边界

/tmp/codex-strict-audit-rGnFTP/reproduce.sh
脚本逐组输出用户要求的验证标记，重跑新探针、选定现有回归、EPERM 专项；新建 fixture/SQLite/日志均留在系统临时目录。模拟 backend 的报告与模型名仅受控输入，协议 fixture 没有真实推理。临时 fixture 的 Git commit 仅初始化测试基线，目标源码仓库无 commit。

repository-before.json / repository-after.json 证明：HEAD 不变，tracked hashes 无变化，git status 为空。所有仓库改动/暂存均为零。共享 STATUS 未修改。

本次定向验证未发现 strict P0/P1 correctness 问题，但不能作为上线验收：远程最低 Node 版本矩阵仍红；没有真实桌面停止、hooks 实际执行、长期运行、主机掉电/宿主骤死全过程或真实模型权限行为。现有自动化的运行时子进程 crash 不等同于真实桌面宿主退出。未覆盖恶意程序 setsid 逃出进程组、检查之后其他进程造成的漂移、ignored 依赖/环境变化。worktree/验收命令不是 OS 沙箱，该边界文档已明示。

最终上线结论由主代理整合全量结果、消费者安装和宿主证据判定，本成员仅交接可独立复核的 strict 证据。
