# 实现说明

## 核心边界

当前 Codex 会话是 captain，负责授权目标、验收和显式集成。代码负责合同、持久状态、执行与证据；不驻留后台自动规划器。Node.js 24+ 原生 ESM，无编译步骤，Zod 校验边界，内置 SQLite，官方 MCP SDK。

核心只有 11 个源文件。contracts/policy 管合同和显式上下文；runtime/store 拥有状态；app-server 封装官方 App Server；workspace/verification 负责 Git 与一个真实命令；MCP/CLI 两个入口，plugin 只封装本机产物。没有前端、第三方进程框架或独立验证队列。

## 合同与执行

任务合同不可变，依赖只能引用已创建任务。默认 expert；qualified 需要任务类型评测资格和 operator evidence。写任务必须 expert、workspace-write、verification 与非空 allowedPaths。任何一次模型执行都是全新 thread，不复制父聊天。

普通只读任务默认并发 2/最大 4。executionPlan 任务独占成员/验证阶段。每次 attempt 捕获 HEAD、source/index 指纹与实际文件基线，临时 index 不写回原 index；显式 snapshot 支持当前脏文件最终内容。worktree 使用 detached HEAD 和专属 ref，忽略依赖/状态库不复制。

线程从有效配置禁用继承的 MCP、plugins、apps、hooks、memories、多 Agent 和 web search。只读线程确认 readOnly/network=false/approval=never。写线程确认 workspaceWrite、无额外 writableRoots、网络关闭、临时目录排除、cwd 正确。宿主/OS 执行沙箱；allowedPaths 是审计门禁，不是逐文件 syscall 白名单。

写成员只改独立 worktree。读取结果后核对结构化 acceptance 原文、进程组退出、source/HEAD 与路径范围，捕获原始 Git binary patch 和文件指纹。命令按照 command+args spawn，stdout/stderr bytes 有合计上限；超时/取消先 TERM 后 KILL，close 与 group 消失共同确认退出。macOS EPERM 时按 ps 复核成员 fallback；恢复时不 kill 旧 PID。

命令通过且输入未变后，写任务在新只读 thread 中使用 profiles.expert 独立审查 patch、实际文件与日志。review model 不得变更，也不能复用 writer thread。所有 acceptance 满足、无 blocker、review 后 patch 未变，才进入 awaiting_review。机器结果不代替 captain。

## 状态与复核

只读：pending → running → awaiting_review → succeeded。

写任务：pending → running（基线/写成员/命令/独立审查）→ awaiting_review → awaiting_integration → integrating → succeeded。

失败、blocker、取消、中断分别保留 failed/blocked/cancelled/interrupted。集成失败或中断为 integration_failed，保留已应用 source 文件和日志，不重放。依赖仅在 succeeded 后解锁。

captain review 必须对最新 attempt 原条目逐项记录依据。附加门禁核对 workspace binding、完整 command 合同、基线与 candidate、当前 input 指纹、stdout/stderr SHA-256 与独立 expert 审查。内容/日志/patch 变化拒绝通过。文件证据和真正的检查仍由 captain 负责，authority 明确 captain-attested。

SQLite 唯一 owner 持有 PID+token。task 与 workspace 关联在同一事务中写入，故障整体回滚；旧 attempt 迟到写入拒绝。running/integrating 的 owner 崩溃不会自动重派；旧 member/reviewer/verification group 活着时拒绝接管。失败但退出未确认也阻止新执行。PID 复用保守拒绝，启动前落盘 launch phase；极早崩溃的未知 launch 拒绝恢复，不把缺失 PID 当成退出确认。

## 显式集成

集成只接受当前 captain-approved write attempt。再次核对候选、日志、review 与 source/index/HEAD 基线。Git apply --check 与 source 指纹复查后，apply 本次 binary patch，不 stage、commit、push 或自动 merge。应用后用临时 index 核对整个 candidate tree、原 HEAD 和原 index 指纹。

随后在 source cwd 执行原 verification 合同，记录单独 phase=integration 回执。命令通过、退出确认、source input 没有再变化才 succeeded。失败/取消保留变化供用户审查；不自动 rollback，避免抹掉并发用户编辑。source 有任何 drift/冲突时拒绝集成，用户自行重规划。

## 插件与产品入口

标准 root plugin.json + mcp.json + skills，加 .codex-plugin/plugin.json/.mcp.json 本机兼容。pack 只输出新目录，复制锁定生产依赖和已解析配置；路径相对于插件根目录，Node/Codex 为本机安装。没有自动注册/安装。

MCP initialize/listTools 不创建 owner，第一次实际 tool 才创建 runtime；宿主接口发现连接可以并存，两个任务操作连接不能争用状态。七工具维持 create/start/status/wait/review/integrate/cancel。cancel 可显式 cleanup/discard 清理最新 worktree，保留 succeeded 和日志。CLI 提供独立操作入口但不能抢活 MCP owner。

## 验证依据与限制

协议 fixtures 用于竞态/权限/错误注入，不是模型证据。真实 SDK stdio、临时 CODEX_HOME 实际 CLI 安装/缓存独立启动、App Server 工具调用、本机沙箱 syscall、真实 writer+reviewer 写闭环均有单独记录。未代操作桌面 UI，不能声称父聊天主动唤醒或复杂任务成功率。

worktree 共用 Git 对象，不是 VM；命令为显式本机程序，不复制 ignored 依赖/环境。主动 setsid 的后代可能逃离 process group，PID/所有平台版本矩阵仍有限制。Git filters/submodule/sparse/unmerged/越界 symlink 等仓库形态拒绝，限额详见 WORKSPACES.md。

## 参考与取舍

来源核对日期 2026-10-11；版本相关行为以本机 schema + 实测为准，不要求模拟随实现“自证”。

- 官方 App Server：https://developers.openai.com/codex/app-server
- 官方插件包装：https://developers.openai.com/plugins/build/plugins
- 官方权限配置：https://developers.openai.com/codex/config-reference
- 官方 MCP SDK：https://github.com/modelcontextprotocol/typescript-sdk
- Codex 进程组/后代清理：https://github.com/openai/codex/blob/main/codex-rs/utils/pty/src/process_group.rs
- Execa 取消、超时与升级强杀：https://github.com/sindresorhus/execa/blob/main/docs/termination.md
- Symphony 隔离 workspace 与恢复职责：https://github.com/openai/symphony
- Git worktree：https://git-scm.com/docs/git-worktree
- OMX（任务组织比较，未移植其大型调度）：https://github.com/Yeachan-Heo/oh-my-codex

采用明确合同、独立 workspace、进程清理和证据复核这些窄做法；没有引入 Execa 依赖，也没有复制 Symphony/OMX 的服务、界面或常驻调度结构。
