# 0.6.2 委派规则与停止联动修复

依据 [委派及停止排查](DELEGATION-AUDIT-2026-10-14.md) 和 PRINCIPLES.md。用户要求停止当前任务时，其成员子进程也停止，并授权实施修复。交付目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`，版本 0.6.2。本轮不安装正式缓存、不修改用户配置、不替用户信任 hooks。

## 实现

### 委派判断

team skill 现在要求普通探索派发前明确队长立即执行的独立交付、成员产物及值得交接的收益。队长只剩等待、转述或重复探索时直接完成；默认并发 2 是容量，不要求两名成员。必要独立审查可按质量收益单独委派。用户要求的第一回答不应因分工延迟，成员没有继承的 MCP/插件能力不应被默认为可用。

running 状态提示成员继续当前阶段，同时提醒队长继续独立交付。它是行动指引，不是声称队长已经在执行某项工作，也不构成性能评测。

### 宿主停止联动

新增 host-lifecycle.js、host-hook.js，打包插件启用 `--host-lifecycle` 并生成三个官方命令 hooks：PreToolUse、Interrupt、SessionEnd。

1. PreToolUse 从宿主 JSON 取得 session_id、turn_id 及 start/integrate 的 taskId/workspace，向既有 owner 的本地 Unix socket 登记。控制端点仅当前用户可读写，capability 随连接生成，不开放网络监听。
2. owner 返回一次性 hostTicket；hook 按官方 updatedInput 格式保留原参数并加入票据。MCP 校验票据、绑定代次及中断标记，异步模型发现后再检查，实际派发后绑定 attemptId；宿主身份写入 attempt.host。队长不能编造票据来补绑定。
3. Interrupt 先记录对应宿主轮已停止，再取消匹配 session/turn 的绑定工作；SessionEnd 按 session 取消。取消前核对当前 attempt，旧轮事件不能取消新轮重试，不按 cwd/PID 批量停止其他聊天。
4. 取消等待成员/reviewer/验证完成，并检查成员退出、活跃条目与工作区验证记录。hook 最长3秒，连接超时或退出未确认时明确警告，后台 owner 继续既有清理，不把请求已发出当退出成功。集成已经写入源的内容保留。
5. 缺少有效绑定时，插件拒绝 start/integrate。纯 status/models 保持无 owner 观察；MCP 重连后继续持久任务前使用 `teams_wait({workspace,taskId,timeoutMs:0})` 初始化 owner 并发布端点。旧进程未确认退出时仍禁止绕过恢复门禁。

生产插件通过 hooks 注册，测试及直接 CLI 保留显式取消入口。没有添加新的 MCP 工具、全项目扫描、任务状态第二写入者或后台自主队长。

### 父运行时骤死

新增 managed-process.js、process-guard.js、process-group.js，成员/reviewer 的 App Server 和验证命令共用 spawnManaged。每个 guard 是受管理进程组组长，命令继承标准输入/输出/错误，但不继承私有 fd 3。

父运行时持有私有管道；它被 SIGKILL 时，OS 关闭该端，guard 收到 EOF 后向自己的组发送 TERM，仍未退出则300ms后 KILL。正常完成保留命令退出码/信号，启动错误及后代残留使用有界私有回执，不混入命令日志。macOS 的组信号降级仍只作用于核验过的组成员。

守护不调用模型、不调度任务，随命令结束。保障限于仍在原进程组的后代，不覆盖自行 setsid/detached 逃离组、同时杀掉守护、权限突变或系统不可中断状态。未确认退出时不迁移为成功或放开重派。

## 协议与独立审查

官方依据：

- [Codex hooks](https://developers.openai.com/codex/hooks)：stdin JSON、session/turn 字段、Interrupt 时限、PLUGIN_ROOT、信任要求及 PreToolUse updatedInput。
- [Build plugins](https://developers.openai.com/codex/plugins/build)：portable manifest 在 `extensions.com.openai.hooks` 声明路径；兼容 manifest 也声明 hooks。只生成默认 hooks/hooks.json 不作为本机解析证明。

本机 CLI `0.162.0-alpha.17.2` 重新导出 schema 至 `/tmp/teams-stop-schema-062-20261014`。本轮两份只读成员报告均用 GPT-6.1 Sol/high、captain-explicit，未复制父聊天历史；主 Agent 并行实现/测试/打包，成员不写状态文档。

队长另做真实官方 plugin/read 四格式对照（无推理）：portable扩展、portable顶层hooks、portable内联扩展均返回 hooks=[]；仅兼容manifest返回 preToolUse/sessionEnd/interrupt。证据 `/tmp/teams-hook-formats-20261014.json`。因此最终本机包只输出官方兼容manifest，根portable定义保留在源码但不放入产物，防止遮蔽hooks。此前“仅加portable扩展即可”已被实际协议证据否定，失败smoke日志保留，后续新CLI恢复portable前需实测。

- 协议设计报告：task `db965cfe-cf0c-47a5-8834-1dde46eb1f32`，attempt `3e817a38-4155-4774-9c64-71fe8d57511e`，204.0秒。队长对照官方原文和本机 schema 后逐条 pass，succeeded；不代表补丁验收。
- 独立补丁审查：task `61899184-0d6d-4d5f-9cb1-598129a11196`，attempt `5108600f-7407-46d1-bb29-72b57e9b296d`，279.5秒。报告三个静态发现，队长确认并修补：descendants 分支必须安装有界清理计时器、重连 endpoint 初始化步骤、不可达 endpoint 不得静默表示退出成功。对应定向回归已由队长执行；成员没有复验最终补丁。

## 验证记录

命令通过、成员意见和队长判断分别记录。首次新生命周期 fixture 误绑定主工作区并泄漏测试监听，本轮已终止该受控测试、修正临时工作区及清理注册；不隐藏失败。首轮全量301/302，唯一新 stdio 用例的3秒就绪等待在全量负载下超时，已调整为有界12秒并增加失败状态诊断。

- 修补前半段定向68/68，10893.781583ms；打包/更新/生命周期26/26，10620.546125ms。
- 审查发现修补后定向35/35，0 fail/cancelled/skipped，10049.961625ms，日志 `/tmp/teams-stop-final-targeted-20261014.log`。覆盖一次性票据、精确取消、旧轮与重试、发现期间停止、实际 stdio MCP/命令hook输入、重连、端点不可达、后代可见性延迟及原验证/打包回归。
- SIGKILL 回归实际强杀临时父进程，确认成员/验证及忽略TERM的同组后代退出；模拟协议成员不是真实模型。原聊天或用户进程没有被取消/强杀。
- skill 官方 quick_validate.py 因当前Python缺少PyYAML未运行成功；未安装额外依赖，使用独立入口元数据/必填字段检查及队长规则检查。该检查不能证明模型一定做出最佳委派选择。
- 最终标准 `npm test` **306/306**，0 fail/cancelled/skipped，85964.450834ms，Node v24.21.0/macOS，日志 `/tmp/teams-stop-npm-final-20261014.log`。测试与覆盖率脚本固定并发4，不减少测试；此前默认并发最终全量302/305的等待/Git时限失败及301/302历史均保留日志。
- 兼容打包/构建/更新24/24，8882.679083ms；最后增加“缓存残留portable manifest遮蔽hooks”回退用例，更新11/11，4062.803958ms。最终全量包含该用例。
- 真实临时宿主缓存smoke：三个hooks同时在plugin/read和全局hooks/list中被发现，MCP八工具、skill、双项目路由、无绑定门禁及运行时退出通过。日志 `/tmp/teams-stop-host-smoke-compat-final-20261014.log`，最后回执整理复验 `/tmp/teams-stop-host-smoke-verified-20261014.log`。没有推理、没有正式配置修改、没有代用户信任或点击桌面停止；`hostHookExecutionVerified=false` 明确保留。先前portable空摘要、源目录提前移除导致plugin/read失败的日志不删改。
- 最终候选 `/Users/anshunli1/asl/code/github/codex-agent-teams/dist/marketplace-v0.6.2-stop-verified-20261014`，官方兼容manifest；28个源码/技能/原则文件逐字节一致，build digest `7c003054d72675adf22c64824af8f43da8b0add9be6ecdc4cbbcd7a61d37f2d3`。无推理doctor及只读权限线程检查通过，回执 `/tmp/teams-stop-verified-candidate-20261014.json`。旧候选保留，不作为最终安装目标。

## 安装与未解决边界

正式生效需要用户显式更新插件、重启旧连接，并在宿主启用和信任这三个 hooks。信任是宿主要求，不代用户填写；本轮不会自动安装。若宿主版本不支持、hooks被禁用或定义不受信任，不能宣称停止按钮已经联动；缺少PreToolUse票据时保持拒绝启动。只保留PreToolUse却单独禁用Interrupt属于不满足配置前提，票据本身不能证明所有停止hook仍在执行。

本机 alpha 的全局 hooks/list 观察和 plugin/read 的插件定义解析分开报告；无推理解析不等于运行时hook执行。真实桌面按钮、writer/reviewer完整写闭环、Linux/远程CI、其他模型、异常信号权限以及真实交付收益仍单独验收。中间发现摘要与特定MCP白名单后置，当前优先用窄合同减少交接。

交付在主目录，无跨worktree未同步；本轮所有新增修改未暂存，保留原暂存树 `1d66c24c8d6ca5dc6f6f7f78d1a0efa625442afb`，未commit/push/update或改正式缓存。
