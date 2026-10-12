# P1 基线与 worktree 准备

0.2.0 提供手工 workspace CLI，也支持绑定只读/写 task 的端到端闭环。写任务在命令验证、独立 expert 审查和 captain 复核后等待显式集成，source 再验证通过才成功。

## 准备与查询

使用现有 `teams.local.json`，其 workspace 必须是有 HEAD 的 Git 工作区根目录。可以是已有的 linked worktree。运行时通过目标工作区的 SQLite 获取唯一 owner；不要在另一个 MCP 连接已操作该工作区时启动 CLI。

```sh
node src/cli.js workspace prepare --config ./teams.local.json
node src/cli.js workspace list --config ./teams.local.json
```

默认 `dirtyPolicy: reject`。存在暂存、未暂存或未跟踪改动就拒绝，失败原因和记录 id 会保存。

要明确把现有改动作为基线：

```sh
node src/cli.js workspace prepare --config ./teams.local.json --dirty snapshot
```

snapshot 使用临时 Git index 捕获当前文件内容，包括暂存加未暂存的最终内容、删除和非忽略的新文件，不运行 stash，不修改原 index、原文件或当前分支。忽略文件不复制；`.codex-teams/` 总是排除，目标仓库尚未忽略它时也一样。配置、依赖和缓存是否被 Git 忽略会影响可携带内容，不能把这个快照当成整个运行环境的复制。

记录包含原 HEAD、tree、基线 commit、专属 ref、原 index 指纹、源工作区指纹、文件内容 hash/执行位和原改动清单。有内容变化时生成独立基线 commit；干净内容直接引用 HEAD。`refs/codex-teams/workspaces/<id>` 保留基线，工作目录是 `<workspace>/.codex-teams/worktrees/<id>`，新 worktree 使用 detached HEAD。

源工作区在捕获后、checkout 后各复核一次；checkout 逐文件核对字节、执行位与符号链接。源文件变化或 Git 归一化导致内容不一致就记录失败，不重试、不标 ready。并发检查可以发现观测到的变化，不能代替排他文件系统锁。

## 改动审计

```sh
node src/cli.js workspace inspect --config ./teams.local.json --id '<准备输出的 id>'
node src/cli.js workspace inspect --config ./teams.local.json --id '<准备输出的 id>' --allow src --allow tests
```

`allowedPaths` 只接受仓库相对的文件名或目录名，不使用 glob，不接受绝对路径、`..` 或末尾 `/`。目录按路径分隔符匹配，不会把 `src-other` 当成 `src`。

返回的 `lastInspection` 包含：

- `changedPaths`：相对基线的改动路径，包括新提交、暂存/未暂存、重命名两端、未跟踪和忽略文件。
- `headChanged`：是否生成了新的提交，即使文件最终又改回，也不能静默删除新提交。
- `sourceChanged`：原工作区相对准备时是否变化；原工作区的后续改动不会被回滚。源检查不可完成时另记录 `sourceCheckError`。
- `scopeChecked` / `outOfScope`：是否提供了路径范围，以及超出范围的路径。没有提供范围时不会声称完成范围验收。
- `clean`：工作目录、内容 hash/执行位和 HEAD 都符合基线。逐文件比较能发现 Git `assume-unchanged` 隐藏的改动。

这只是文件内容和路径范围检查；没有执行测试，不证明业务正确，也不能限制工作目录外的进程写入。

## 执行真实验收命令

先准备 worktree，再明确指定命令合同；`examples/verification.json` 给出本项目的示例：

```sh
node src/cli.js workspace verify --config ./teams.local.json --id '<id>' --spec ./examples/verification.json
```

合同是一个可执行文件和参数数组，直接 spawn，不拼接 shell。相对脚本/可执行路径相对于 managed worktree，普通命令名从 PATH 查找。可以用 `npm` + `["test"]`，其内部脚本行为由项目决定。手工 verify 只执行这一个命令，不自动安装依赖、重试、调用模型或验收任务；绑定写任务在命令后另有独立模型审查。

```json
{
  "command": "node",
  "args": ["--test", "tests/core.test.js"],
  "timeoutMs": 60000,
  "maxOutputBytes": 2097152
}
```

回执包含命令原文、基线 commit、实际 worktree 路径、验证前后 HEAD/内容指纹、child PID、stdout/stderr 日志路径、字节数、退出码/信号和 `cleanupConfirmed`。原始日志位于源工作区的 `.codex-teams/verifications/<verification-id>/`，在移除 worktree 后仍保留。CLI stdout 只打印 JSON，非 passed 返回进程退出码 1；`workspace list` 返回简短记录和最近验证。

状态区分 passed、failed、timed_out、cancelled、output_limit、interrupted 和 recovery_required。passed 只表示命令返回 0、进程组退出已确认且后审计可完成；不会批准成员任务。`workspaceChanged` 告知命令是否改写了所记录的输入文件；指纹覆盖 tracked/非忽略 untracked 文件，不覆盖 ignored 依赖、环境变量或运行中瞬时变化，不能当成整个构建环境的 hash。

stdout+stderr 默认合计 2 MiB，最多 16 MiB；超限即停止 producer 并标记 outputTruncated，不把截断结果当通过。默认执行截止时间 10 分钟、最长 1 小时。取消/超时先 SIGTERM，300 ms 后必要时 SIGKILL，并等待 close 和进程组消失；清理仍未确认时保留 recovery_required 并阻止再次执行/清理 worktree。CLI 接收 SIGINT/SIGTERM 时走同一取消路径。

一个运行时同时执行一个验证命令，与成员执行互斥；每个 worktree 最多保留 20 项验证回执，超出后准备新工作区。复用 workspace SQLite 表，无新增调度层或后台服务。

运行时崩溃后若记录的进程组仍存在，拒绝接管，也不向旧 PID 发信号。确认其退出后重开运行时才记录 interruption/复核退出状态。若崩溃时 PID 还未持久化，不能证明退出，保留未确认标记供人工核对；成员/审查的 launch phase 在 spawn 前落盘，未知身份的启动会拒绝接管，而非自动假定没有进程。没有自动重放命令。

依赖不随 Git 快照复制。配置、lockfile、忽略的 node_modules/缓存和可执行环境需操作者明确准备；验证记录既不声称依赖隔离，也不自动联网安装。命令是显式授权的本机程序，worktree 是 cwd，不是 OS 沙箱；创建独立 session 的后台程序可能逃离进程组，完整沙箱和进程身份绑定仍在后续阶段。

## 清理与恢复

```sh
node src/cli.js workspace remove --config ./teams.local.json --id '<准备输出的 id>'
```

默认只删除干净的 managed worktree。发现新提交、未提交或忽略文件就拒绝，保留目录和基线 ref。如果已确认丢弃这些 worktree 内的内容，再显式执行：

```sh
node src/cli.js workspace remove --config ./teams.local.json --id '<准备输出的 id>' --discard
```

清理前核对记录 id、目标路径、Git 注册、common dir、Git file 的反向指针和基线 ref。使用 Git 删除已核对的单个 worktree，并按原值删除专属 ref，不递归删除任意目录，不执行全局 worktree prune，也不解除用户的 worktree lock。

状态是 `preparing → ready → removing → removed`。准备失败为 `failed`；中途崩溃的 preparing/removing 在重开 SQLite 后成为 `recovery_required`，不会自动创建、删除或重放 Git 操作。完整身份可确认时可再次 inspect/remove；路径或元数据被替换、注册仍在但目录丢失时拒绝操作，需先人工核对和修复。没有生成任何产物的失败记录也可通过 remove 标记移除。

准备、审计、验证和清理要求本运行时没有活跃成员或其他验证命令。带 executionPlan 的只读任务已绑定工作目录与 attempt/进程阶段；手工准备仍可单独使用，写任务另见下一节。

## 绑定到 task/attempt

任务创建时可添加不可变 `executionPlan`，内容为 dirtyPolicy 与一个 verification 合同，示例见 `examples/verified-read-only-task.json`。它是既有 `teams_create`/CLI run 的可选字段，没有新增 MCP 工具。`execution` 继续保存运行结果，两个字段职责独立。

start 后，准备记录以 `{taskId, attemptId}` 绑定，在同一 SQLite 事务中写入 workspace 与 attempt.workspaceId；每次 attempt 独占新目录。基线 commit/输入内容指纹随后写入 attempt。成员 App Server 的 cwd 指向该 worktree。只读成员核对 readOnly；写成员核对 workspaceWrite、无额外可写根、临时目录排除；双方都关闭 network，approval=never。

成员结果有 blockers 时不执行验证。结构化结果符合合同、文件未变且成员组确认退出后，运行时执行计划中的命令。回执关联 taskId/attemptId/verificationId，同时写入 workspace 与 attempt。任务的总 deadline 和取消贯穿成员与命令阶段；命令失败、未确认退出或改写输入时任务 failed/cancelled，保留报告与日志，不解锁依赖。

进入 awaiting_review 仍需队长逐项检验引用。pass 时检查最新 attempt、workspace binding、基线、准确的 command/args/限额、passed/cleanupConfirmed、验证前后指纹和当前内容，并重算 stdout/stderr SHA-256。后来的输入文件/日志变化、旧 receipt、旧 review 都会被拒绝。命令生成的 ignored 缓存可以保留，但不计入输入指纹；清理这些输出仍需显式 discard。写任务另需独立 expert 审查通过，当前候选摘要匹配；机器验证与模型审查仍不替代 captain。

running/awaiting_review/awaiting_integration/integrating 的当前 attempt 绑定目录不能清理；须先完成集成或 cancel，并确认成员/命令退出。可通过 `teams_status` 获取 workspaceId，MCP 持有 owner 时用 teams_cancel 的 cleanup/discard；owner 关闭后可用 CLI remove。绑定目录的 verify 不提供手工替换回执入口，只能由其所属 attempt 执行。

重试仍需显式理由、使用 expert、最多三次，从源工作区捕获新基线；旧工作区与日志不自动删除。旧 attempt 的工作区状态迟到写入也被拒绝。崩溃恢复不会自动创建、验证或重派；活旧组阻止接管。

为保持实现小，带计划的任务本轮独占执行阶段，不建验证队列；普通只读任务仍可按既有并发运行。基线 capture 的同步 Git 段不能即时响应信号，仍受单条 Git 命令截止时间约束；捕获后总 deadline 已耗尽时不会再启动成员。指纹没有覆盖 ignored 依赖、环境或瞬时变化；写成员沙箱/独立 expert 审查/显式集成已有实现；这些指纹仍不能证明所有环境与复杂任务质量。

## 写任务与显式集成

mode=workspace-write 要求 expert、verification 和 allowedPaths。allowedPaths 为精确文件/目录前缀，不允许 .git/.codex-teams/越界路径。宿主沙箱限制写 worktree，运行时审计包括被忽略的新文件，范围违规、改 HEAD/原 source 或空 patch 都拒绝继续。命令可生成忽略缓存；不属于 input 指纹，清理时仍保留到显式 discard。

候选以 Git tree、原始 binary patch、文件内容 digest 和路径清单保存。patch 不超过 1 MiB，review packet 不超过 120000 字符；超出要求缩小改动。命令通过后新的 expert/read-only thread 独立检查，模型回显和新 thread id 受核对。报告 blocker 或不满足任一 criterion 拒绝；失败原因和 review 证据供新 attempt 参考。

captain pass 将写任务变成 awaiting_integration，不解锁依赖。teams_integrate 或 CLI integrate 接受最新 taskId/attemptId，复核 candidate/日志/模型 review，再确认 source HEAD/index/files 指纹与准备时完全一致。git apply --check 后应用 patch、不暂存、不提交，核对整棵 candidate tree；再在 source 执行同一 command 合同。

source drift、冲突、陈旧 evidence 在应用前拒绝。应用后失败/取消/crash 记 integration_failed，保留 source 变化和所有证据。系统不会自动回滚/reapply，避免覆盖用户同时编辑；检查文件和 phase=integration 日志后重规划。原有 staged/unstaged 内容可以通过显式 snapshot 参与基线，原 index/HEAD 保持不动。

任务 deadline 覆盖 baseline/writer/command/reviewer；integration 有独立同限 deadline。同步 Git 命令有每条截止时间，不能即时中断，但阶段完成后检查绝对 deadline。活 member/reviewer 或验证清理未确认均阻止任何新执行和目录删除；恢复不 kill 旧 PID。

## 当前支持边界

- Node.js 24+、macOS/Linux。此次实测 Node `v24.21.0`、Apple Git `2.54.0`；其他 Git/平台组合未跑完整矩阵。
- 拒绝 unborn repo、submodule/gitlink、unmerged index、sparse/skip-worktree、源 index 的 assume-unchanged、外部 clean/smudge filter，以及绝对或越界的符号链接。内部相对符号链接支持。
- 最多 10000 个基线文件，单文件 64 MiB、合计 256 MiB；Git 输出上限 16 MiB，每条命令 15 秒，超限返回错误，不截断验收证据。
- Git checkout hooks 被禁用；继承的 GIT_DIR、GIT_INDEX_FILE 等环境覆盖不用于这些操作。
- Worktree 共用 Git 对象、refs 和本机环境；它不是 OS 沙箱。文件改动审计、执行权限和命令隔离需要分别实现。
- 清理只删除 worktree 和基线 ref；Git 对象是否回收由 Git 自身决定，项目不调用 gc/prune。
