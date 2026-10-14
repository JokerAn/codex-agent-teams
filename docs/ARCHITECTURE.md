# 实现说明

## 核心边界

当前 Codex 会话是 captain，负责授权目标、验收和显式集成。代码负责合同、持久状态、执行与证据；不驻留后台自动规划器。Node.js 24+ 原生 ESM，无编译步骤，Zod 校验边界，内置 SQLite，官方 MCP SDK。

核心有 16 个源文件。contracts/policy 管合同和显式上下文；runtime/store 拥有状态；app-server 封装官方 App Server；workspace/verification 负责 Git 与一个真实命令；MCP/CLI 两个入口，plugin 只封装本机产物；status 提供无 owner 的状态观察、显示摘要与本地 HTML 快照。models 提供用户模型选择表单与交互终端确认，cli-progress 观察前台任务并向 stderr 输出回执，不拥有状态、截止时间或后台调度。workspace-router 延迟创建每个项目的独立运行时，定位已知任务而不建立中央索引。没有前端框架、第三方进程框架或独立验证队列。

## 合同与执行

任务合同不可变，依赖只能引用已创建任务。默认 auto；明确 simple 的非 review 任务可使用用户确认的 simple 模型，其他任务使用 expert，profile=expert 可覆盖选择。qualified 保留旧评测资格要求；公开入口的用户确认只启用 expert/simple 分工。写任务必须 workspace-write、verification 与非空 allowedPaths，独立审查与重试始终使用已确认的 expert。任何一次模型执行都是全新 thread，不复制父聊天。

普通只读任务默认并发 2/最大 4。executionPlan 任务独占成员/验证阶段。每次 attempt 捕获 HEAD、source/index 指纹与实际文件基线，临时 index 不写回原 index；显式 snapshot 支持当前脏文件最终内容。worktree 使用 detached HEAD 和专属 ref，忽略依赖/状态库不复制。

线程从有效配置禁用继承的 MCP、plugins、apps、hooks、memories、多 Agent 和 web search。只读线程确认 readOnly/network=false/approval=never。写线程确认 workspaceWrite、无额外 writableRoots、网络关闭、临时目录排除、cwd 正确。宿主/OS 执行沙箱；allowedPaths 是审计门禁，不是逐文件 syscall 白名单。

写成员只改独立 worktree。读取结果后核对结构化 acceptance 原文、进程组退出、source/HEAD 与路径范围，捕获原始 Git binary patch 和文件指纹。命令按照 command+args spawn，stdout/stderr bytes 有合计上限；超时/取消先 TERM 后 KILL，close 与 group 消失共同确认退出。macOS EPERM 时按 ps 复核成员 fallback；恢复时不 kill 旧 PID。

命令通过且输入未变后，写任务在新只读 thread 中使用 attempt 启动时保存的 expert 模型独立审查 patch、实际文件与日志。review model 不得变更，也不能复用 writer thread。所有 acceptance 满足、无 blocker、review 后 patch 未变，才进入 awaiting_review。机器结果不代替 captain。

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

MCP initialize/listTools 不创建 owner，第一次实际写入/执行 tool 才创建 runtime；teams_status 使用独立 read-only SQLite 快照；宿主接口发现连接可以并存，两个写入/执行连接不能争用状态，只读状态连接可并存。八工具维持 models/create/start/status/wait/review/integrate/cancel。cancel 可显式 cleanup/discard 清理最新 worktree，保留 succeeded 和日志。CLI 提供独立操作入口但不能抢活 MCP owner。

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

## 0.2.2 运行反馈

runtime 在同一 attempt 内保存 phase/phases：准备、成员、审计、验证、独立审查、队长复核、集成与源复验。状态转换和历史记录由当前 owner 唯一写入；显示层不写回、不恢复中断、不触发验收。旧记录缺少 phase 时保留未知，任务状态优先于可能滞后的阶段字段。

status.js 通过 readOnly SQLite + 只读事务获得任务、工作区和 owner 同一快照；从未运行的工作区不创建数据库。owner 摘要只返回 PID 存在性、版本和来源，剔除 token；查看工具 identity 与 owner identity 分开。只读查看不执行项目命令，不争抢现有 owner。MCP 保持七个工具，teams_status 新增 overview/limit 可选参数，原详情/列表兼容。

pack 写入无配置内容的 build-info.json；版本、打包时间、核心源码/技能/包元数据摘要随缓存搬迁保留。HTML 以转义文本显示仓库数据，页面无外部依赖或网络请求，搜索/筛选只处理当前快照。导出为显式的新文件，不开启服务，也不承诺宿主自动注入可视化界面。聊天提示由 team 技能的前台反馈约定执行，不能保证父聊天唤醒或宿主原生进度 UI。

## 用户确认模型分工（0.3.0）

MCP 新增 teams_models，CLI 新增 models；官方 App Server model/list 提供当前可见模型/强度，config/read 只提取模型和强度字段。目录默认项与有效配置分开，未推测强弱或价格。MCP 通过官方 SDK elicitation 请求宿主用户表单，不接受工具参数中的模型选择或批准字段；CLI start/run 通过交互终端确认，无 --yes 入口。公开入口未确认时不启动成员；底层 TaskRuntime 的受控测试/显式模型 smoke 可独立使用构造选项。

确认仅在本次运行时内存中有效，重启后需要重新确认。确认快照和选择理由随 attempt 留证，写任务 reviewerSelection 固定于 attempt，后续改变选择不改变旧验收依据。重试仍需明确理由并使用当前用户确认的 expert。表单等待期间拒绝启动，提交后重新检查目录中的模型/effort 对；取消、无表单支持或无有效候选不授予授权。用户可以选择不使用 simple。

真实本机宿主 on-request 外层会话可转发表单请求，approval_policy=never 时观察到直接 decline、没有表单转发；这是宿主交互策略边界，不修改成员 approval=never。当前聊天队长模型由宿主选择，插件既不切换也不认证其能力。UI 具体样式与桌面点击验收独立于协议/SDK 测试。

## 0.4.0 目标、确认及预检

workspace 提供 checkout 身份，包含真实根目录、设备/inode、Git 目录身份及 commonDir；同一仓库的不同 worktree 分别绑定。新任务保存 target，公开创建入口核对 expectedWorkspace；旧无绑定任务禁止重新启动，不追溯修改历史。

models 保留真人确认来源/时间、策略版本与目标绑定。表单 remember 默认开启但必须明确提交布尔值，真人确认后由唯一 owner 在既有 SQLite meta 存 modelPreference；readSnapshot 只读观察，不为列模型获取 owner。终端回车默认记住，但仍要求最终输入 yes 确认。启动入口重新发现模型并校验确认，runtime 持有恢复后的选择；forget 或新的仅本次确认清除持久偏好。没有数据库 schema 升级、额外工具或运行依赖。

0.4.1 包内现代 MCP 入口用可执行 `./mcp-launch`，通过安全 POSIX 引用调用打包所用的绝对 Node；兼容入口允许绝对 Node 并调用同一个 JS launcher。JS launcher 给宿主实时 PATH 前置 Node 目录，不序列化构建环境 PATH。Codex 另行解析并检查绝对可执行身份。本机实际 loader 拒绝现代配置的绝对 command，官方实现依据：[agent_plugin_config.rs](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs)。这条宿主约束由真实缓存 smoke 验证，普通 SDK stdio 客户端本身不执行该限制。

## 0.5.0 项目路由

0.5.1 启动增加可选 `models`（expert/simple）显式派发。该选择不改 runtime 全局 profiles；成员/reviewer 的分工和 captain-explicit 来源只写入本 attempt。合同 model/effort 覆盖成员选择，review 必须匹配 expert；重试清除覆盖并使用 expert。MCP/CLI 在每次启动前发现实时目录，runtime 在开始记录 attempt 前检查角色与最终选择。用户偏好仍按原真人确认路径复用，显式派发不保存为偏好；未显式指定且无有效偏好时继续拒绝，不从配置静默替换。表单通过 peekRuntime 只检查既有运行时，明确 accept 且提交有效后才获取 owner。

打包与 build 删除包内 workspace，保留原配置文件。CLI 无固定 workspace 时以实际 cwd 或 --workspace 选项目；MCP 不使用 cwd 兜底，因为进程通常位于插件缓存。队长从聊天上下文填写 models/status 的 workspace 和 create 的 expectedWorkspace，其他工具增加可选 workspace。单连接已知任务 ID 可省略路径，重连需上下文；多项目无任务 ID 时不猜最近目录。

workspace-router 以真实目录身份复用稳定 scope，每次访问与异步发现返回后核对身份，符号链接别名不产生第二 owner。scope 提供各项目 getRuntime/observe/discoverModels；MCP 每次请求保留其局部 scope，不共享可变的当前目录。确认进行中与会话选择分别按项目记录，持久偏好在原项目 SQLite 中保存，另一项目无法复用。每个项目继续有独立并发限额与串行验证门禁，没有跨项目依赖或全局后台调度。

taskId 仅在此连接已知项目的只读快照中查找，不扫描任意目录或使用跨项目中央数据库；错误 workspace 拒绝操作。显式项目只核自身身份；仅 ID 自动定位遇已知目录漂移时拒绝猜测，队长可补该任务的实际项目。关闭等待所有已创建运行时退出并聚合错误，模型发现/观察未创建 owner 的项目无需恢复。旧含 workspace 的直接配置保持固定目标语义。

新增 preflight 模块：worktree 准备后解析验证程序和显式依赖，不运行代码或基线测试，不自动安装。失败记录结构化 code/phase/nextAction，原始 error 和进程退出门禁保留。Node 包检查采用 require 条件，不是通用构建环境证明；预检通过不改变真实命令/审查/源复验要求。
