# 当前状态

日期：2026-10-12（Asia/Shanghai）。源码版本：0.3.0。**本机回归通过：新增真实模型发现、用户确认和简单/复杂任务分工，保留此前交付闭环与修补。当前会话尚未重装新包。**

## 0.3.0 build 在普通终端找不到 Codex CLI 的修补（2026-10-12）

- 用户实报 `npm run build` 在打包后出现 `spawn codex ENOENT`。本机配置保存裸命令 codex，桌面 CLI 实际位于 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`；普通终端缺少对应 PATH。
- 新增不依赖 npm 的构建路径解析：安装依赖前检查 CLI，优先显式参数/配置与 PATH，默认 codex 缺失时检查 macOS 标准桌面应用路径；支持 `--binary`。无效显式路径不静默替换，缺 CLI 提前报错。
- build 的初始化探测、doctor 和包内配置统一使用解析后的绝对路径；已有本机配置原样保留，避免仅修 build 后插件缓存仍依赖终端 PATH。没有改动 Codex 全局配置、模型分工或用户暂存区。
- 实际从 PATH 移除 Codex，仅保留 Node 与系统命令，运行完整 `npm run build` 成功，真实宿主插件/模型/只读权限检查通过且无推理。产物 `dist/marketplace-v0.3.0-1791797729656/`；核对包内绝对路径及原本机配置不变。
- `node --test tests/build.test.js tests/plugin.test.js`：9/9，通过，覆盖 PATH 优先、桌面回退、无效/自定义路径、安装前失败、包内路径保存及原配置保留。`git diff --check` 通过；本次没有重跑全量或远程 CI。后续直接重跑 build 即可，安装需使用本次成功输出的新目录。

## 0.3.0 用户确认模型分工（2026-10-12）

- 用户明确要求读取 Codex 模型选项、增加用户确认，队长采用高级模型、简单任务可使用轻量模型、复杂任务仍能指定高级模型。依据该授权更新 PRINCIPLES.md；不会把用户确认当成模型质量/费用评测证据。
- 官方 App Server `model/list` 分页读取可见模型、显示名和支持的推理强度；`config/read` 仅返回有效模型与推理强度。未展示密钥/完整配置，目录默认项与有效配置分开。本机实际发现 5 个模型标识，目录默认 group/group，有效配置 krill/gpt-6-astra/high；不将任意一项当成当前聊天实际模型的证明。
- 新增第八个 MCP 工具 `teams_models`：默认只读发现，confirm=true 使用官方 SDK elicitation 向宿主用户请求表单，选择 expert 和可选 simple 模型/强度，并勾选确认。工具参数不能指定模型或代填批准。接收后刷新目录校验，模型消失或组合无效不应用。
- 确认仅保存在当前运行时内存中；同一运行时任务共享选择，重启重新确认。未确认、正在确认、无表单支持时拒绝启动成员。首次取消不授权；取消修改保留旧分工。执行中禁止切换。CLI 新增 models 只读列表，start/run 在交互终端逐步选择并输入 yes；无非交互同意开关。底层 TaskRuntime 的受控测试与显式模型 smoke 仍可独立调用，公开 MCP/CLI 启动入口强制确认。
- 合同默认 profile=auto，新增 complexity=simple 与 profile=simple；仅明确 simple 的非 review 任务使用已确认 simple，bounded/uncertain/complex/review 使用 expert，profile=expert 可强制高级模型。简单写任务允许轻量 writer，但独立 reviewer 和显式重试仍为 expert。每 attempt 保存确认来源、时间、分工快照、选择理由及 reviewerSelection；策略变更不改旧 attempt 的验收依据。
- 队长仍由宿主选择，插件不改变或认证当前聊天模型。用户还未提交本机的生产 expert/simple 选择；测试的自动表单响应是受控 fixture，不记录成真实用户批准。实际宿主 smoke 只回复取消，不消耗模型推理额度。
- 官方依据：Context7 的 OpenAI Codex App Server 与 MCP TypeScript SDK v2.3.1 文档；本机导出的 schema 确认 model/list、config/read 和 elicitation 请求/响应。没有新增依赖、后台服务或前端框架；新增 models.js，一个核心模块（共 13 个）和一个 MCP 工具（共 8 个）。版本元数据统一 0.3.0。
- 定向初轮 82/82 通过。全量首轮暴露旧 CLI 测试仍假定非交互可启动；改为验证拒绝非交互并模拟交互终端后，第二轮发现测试用 node -e 的 argv 偏移错误，修正测试驱动；定向 CLI 1/1 通过。最终 `npm run test:coverage` 163/163，0 fail/cancelled/skipped，46.70 秒；源码行 96.62%、分支 86.67%、函数 94.12%；models.js 行 100%、分支 84.85%。前两轮失败日志保留，不改写为通过。
- 回归包含：用户 accept/decline/cancel/未勾选、参数不能伪造批准、不支持表单、运行时重启失效、等待表单时拒绝并发启动、确认期间模型移除、隐藏模型/分页/配置脱敏、简单/复杂/强制expert路由、重试升级、轻量 writer 与 expert reviewer 完整写/验证/集成链、切换分工后旧 reviewer 证据保持有效，以及交互 CLI 闭环。
- 实际宿主 Codex Desktop 0.162.0-alpha.17.2：外层 approval_policy=never 时直接返回 decline，未观察到表单；不能当作用户取消或 UI 成功。改用允许交互的 on-request 临时外层会话后实际收到表单请求，回复 cancel 后 teams_start 明确拒绝。成员的 approval=never 与沙箱门禁保持原样，未改用户正式配置。
- 最终 `dist/marketplace-v0.3.0/`：13 核心文件、skill、PRINCIPLES 与 package 字节核对，build 摘要重算通过；真实 doctor 无推理通过；临时 CODEX_HOME 安装并删除源包后缓存独立运行，viewer/runtime 均 0.3.0，八工具、模型发现、表单转发/取消、owner退出检查通过。
- 本机证据 `.codex-teams/upgrade-0.3.0/` 保存模型列表、定向/全量日志（包括失败轮）、pack/doctor 和宿主 smoke 各轮回执。本轮由主 Agent 实现与验证，没有启动付费子成员审查；未跑远程 CI、真实模型分工写任务或桌面点击验收，未提交、推送或重装正式缓存。
- 下一步：按 README 重装新包并在允许用户交互的宿主中实际选择角色，确认桌面展示体验；再据真实使用反馈决定是否需要跨运行时保存偏好。未默认认定任何候选是“小模型”，未替用户选择。

## 0.2.3 错误证据与恢复时间修补（2026-10-12）

- 用户授权实施上一轮建议的两个边界小修补。主 Agent 实现，Agent Teams expert 独立只读审查；原有 build 入口及评估文档改动保留。目录匹配、执行环境预检、结构化错误分类与质量/效率评测仍为后续。
- App Server run/probe 在执行与清理同时失败时抛 AggregateError，保留 cause/errors，并在 message 同时保留两项信息，现有 runtime/attempt 错误记录和重试摘要能够保留两项原因。仅清理失败仍抛错，不报告 memberLaunch=exited，退出未确认仍阻止重派；没有改变权限或重试策略。
- store 恢复保留已有 endedAt，另记 recoveryObservedAt；缺少结束证据的成员、集成和验证命令不再用恢复时刻伪造结束时间。阶段终态记录 observedAt，未完成的旧阶段标 interrupted；HTML 明确区分恢复观察与未知结束。
- 新增 6 个用例：run/probe 的双重失败/仅清理失败四种组合，runtime 持久化双重错误并拒绝重试/新任务，以及固定时钟恢复矩阵；原真实 Git 应用后进程退出案例增加结束时间保留断言。故障通过受控协议及 stop 桩注入，不宣称真实宿主已发生同类异常。
- 定向 `node --test tests/backend.test.js tests/status.test.js tests/write.test.js`：70/70，通过，36.02 秒。最终 `npm run test:coverage`：156/156，0 fail/cancelled/skipped，41.94 秒；源码行 96.62%、分支 86.45%、函数 94.21%；app-server/store/status 行覆盖均 100%。
- package/lock 根包和两个 plugin manifest 同步 0.2.3，无新增依赖、工具、核心模块或数据库 schema 版本。README 安装/重装示例更新，ROADMAP 记录小修补。
- 新包 `dist/marketplace-v0.2.3/`，12 个核心源码、技能和 package 元数据与当前源码一致，build 摘要重算通过。实际宿主 doctor 插件发现、模型/effort、readOnly/network=false/approval=never 检查通过，无推理。
- 临时 CODEX_HOME 的真实安装/缓存 smoke 通过：删除源包后缓存仍可运行，viewer/runtime 均 0.2.3，七工具、创建/取消、owner 退出确认通过。实测宿主为 Codex Desktop 0.162.0-alpha.17.2 / macOS arm64；没有修改用户正式配置。
- 独立审查任务 `43bed8a7-114c-4c9b-9f52-1f739767abde`，attempt `0264a15a-c553-4e43-b6be-fc9ad5dbe6ac`，`group/group / high`，成员执行 126.700 秒，退出确认；静态未发现阻塞，队长对三项原标准结合上述真实测试逐项复核后 succeeded。插件贡献为独立审查，代码与命令由主 Agent 完成。host totalTokens=154309、inputTokens=152059（含 cachedInputTokens=93568）、outputTokens=2250；缓存不重复相加，未计算费用或节省。
- 最终文档链接与 `git diff --check` 通过。独立审查之后运行代码及测试未再改动。
- 本机证据：`.codex-teams/upgrade-0.2.3/`，保存 targeted.log、coverage.log、pack.json、doctor.json、plugin-smoke.json。未重跑真实模型 writer/reviewer 写任务或远程 CI，未提交、推送或重装正式缓存。新包可按 README 安装。

## 0.2.2 后续升级评估（2026-10-12）

- 用户要求借助 codex-agent-teams 评估升级方向。本轮只更新评估/状态文档，原有一键 build 未提交改动保留；具体代码依据、最小实现与验收见 [UPGRADE-REVIEW-0.2.2.md](UPGRADE-REVIEW-0.2.2.md)。
- 当前会话实际 MCP viewer 和启动后的 runtime 均为 0.2.2，来源为正式插件缓存，build.createdAt 为 `2026-10-12T05:28:37.493Z`。此前“仍在使用旧缓存、待重装”的记录保留为历史，不适用于本次会话；本轮没有代执行重装。
- 专项成员提出两个边界，队长分别用当前源码与内存桩独立复现：app-server 清理异常覆盖主错误；store 在集成恢复时覆盖已有 endedAt，使固定时钟案例的执行耗时从 60 秒变为 7200 秒。属于受控复现，不是实际宿主组合故障或磁盘崩溃实测；修补尚未实施。
- 升级顺序：先修上述两项，再做目标工作区展示与匹配防护、成员启动前环境预检、结构化错误与恢复指引；随后建立同条件质量/效率对照，并补一键 build 的自动回归与快速失败。
- 团队任务 `fc597599-778f-4e64-84c0-30cc0306f5da`，attempt `4aad8564-3f8c-4770-bc06-e13e7db40cf7`，`group/group / high`，成员执行 594.042 秒，退出确认；经队长逐项复核后 succeeded，仅表示分析报告通过。host totalTokens=758535、inputTokens=743857（含 cachedInputTokens=564864）、outputTokens=14678；不重复加缓存，不计算费用或节省。
- 已检查当前源码、相关测试与历史验证记录；没有重跑全量测试、远程 CI、真实模型写任务或付费批量评测。现有 150/150 与远程四组通过仍为之前记录，本轮不重新认证。
- 文档链接、空白及 git diff --check 通过。下一步建议先交付两个边界修补与定向回归；环境预检由真实失败任务驱动，不要求所有修复任务基线测试先通过，不隐式安装依赖。完整方案是建议，尚未实现。

## 一条命令准备安装包（2026-10-12）

- 新增 `npm run build`：自动安装锁定依赖，首次从宿主默认模型（要求支持 high）和当前项目生成本机配置，已有配置复用，调用原 pack 与 doctor/probe 完成封装和无推理权限检查，打印桌面市场表单填写内容。没有编译步骤或新依赖。
- 重复构建保留旧目录，自动选择带时间戳的新目录；支持显式 config/out 与 TEAMS_CONFIG。不会自动安装到用户 Codex 配置。
- 实际从无 node_modules、无 teams.local.json、无 dist 的状态运行成功；默认模型为 `group/group / high`，目标为本项目。再次构建也通过真实宿主的插件/模型/只读线程检查，生成独立新包，无模型推理。
- 插件定向回归最终 6/6 通过；显式不存在配置在安装依赖前失败。首次回归误与 npm ci 并行，依赖目录重建导致 2 项失败；待安装完成后串行重跑全部通过，不将首次失败记为通过。
- 本机初次包为 `dist/marketplace-v0.2.2`；未代操作桌面安装，未运行全量测试或真实模型任务。下一步在 Codex 添加该本地市场并安装插件；不同工作区或模型可修改本机配置后重新 build。


## 首次远程 CI 与兼容修补（2026-10-12）

- 0.2.2 提交 `f4a74c305465cedd051a6d0d6454784760248163` 已上传到 main，本地与 GitHub API commit/tree SHA 完全一致；首次 Actions run 为 `38206385853`。
- macOS/Linux 的 Node 24.x 两组通过；Node 24.0.0 两组发现相同的测试清理兼容问题：两个用例使用 rmSync 删除指向目录的 symlink，在该版本抛 ERR_FS_EISDIR。
- 修复测试清理为 unlinkSync，明确删除链接本身，并断言目标目录/文件保留；保留两项身份与日志边界测试，不跳过、删除测试或降低 Node 支持范围。运行代码与最终插件包不因本修补改变。
- 修补后本机 verification/workspace 定向回归 40/40 通过，未修改运行代码；兼容补丁 `fda4995459da61a7f18d936a5157ab2498892697` 已提交并上传；提交 `33bdfc4c0ebc97558e74dc61c539222520808094` 的 Actions run `38206728369` 四组全部 success（macOS/Linux × Node 24.0.0/24.x），实际远程矩阵已验证。失败日志保留在 `.codex-teams/pre-push-0.2.2/ci-failed.log`，不将首次失败记录改写为通过。

## 0.2.2 提交前检查与交付（2026-10-12）

用户明确授权检查全部未提交改动，发现 bug 则修复后提交并推送。提交包含前两轮 0.2.1/0.2.2 升级，以及本轮确认并修复的三个边界：

- 旧已停止/集成失败记录缺少 endedAt 时，原显示会随查询时间持续增加耗时；现在缺失结束证据保持未知，仍在执行且 owner 存在时才使用快照时间计算。
- 状态为 running/integrating 但 owner 未检测到时，原 nextAction 仍建议等待；现在明确告警，先检查旧成员/任务记录、勿重复启动，未知执行终点不虚报耗时；原记录不恢复、不改写。
- 接近 16 MiB 的合法协议消息与下一消息同 chunk 到达时，原总缓冲限额会误拒绝；现在逐 newline 消息累计 UTF-8 字节限额，完成一条后清空再处理后续。新增 exact 16 MiB 边界与下一帧同 chunk 的回归，原 fatal/超限/退出门禁保留。

验证：定向 42/42；最终 `npm run test:coverage` 150/150，0 fail/cancelled/skipped，96.52 秒；源码行 96.38%、分支 86.07%、函数 93.41%，status.js 行 100%、分支 91.76%。重建最终 `dist/marketplace-v0.2.2/`，12 核心文件与源码一致，包侧真实 doctor 和临时缓存 overview/七工具/owner 退出 smoke 通过，无推理。未再次运行真实模型写任务；远程 CI 将在实际提交后单独核验。

提交前独立 expert 审查发现协议既有边界后，队长修补并要求新 attempt 复核；最终两条原标准通过，任务 `2f9231e6-c96e-4a47-8d3e-fda9a486c036`，最终 attempt `4a17b9fb-9b1e-4251-96dc-94618515c119`，旧报告不用于新源码验收。两轮成员执行合计 534.314 秒，host totalTokens=298712、inputTokens=295560（含 cachedInputTokens=231424）、outputTokens=3152；缓存不重复相加，不据此计算费用或节省。

原始 UTF-8 分字节传输并未专门实测；边界测试是受控的已解码字符串注入，不作为真实模型异常证明。

远程已通过 GitHub API 确认：`JokerAn/codex-agent-teams` 当前 visibility 为 public、默认分支 main、账号有 push 权限；未改变仓库可见性。原有“私有仓库”表述仅保留为历史记录。远程基线与本地一致，为 `0af4705ef291cb84ad170a995c7defc9355df9e3`。本机 github.com:443 的 Git HTTPS 连接失败，但 api.github.com 可用；可通过官方 Git Data API 上传相同 tree/commit，核对 SHA 后以 force=false 更新 main，不覆盖并发远程改动。

候选提交排除 teams.local.json、.codex-teams、dist、node_modules；未发现所检查的常见凭证格式。正式 Codex 插件配置保持原样，远程源码提交不等于缓存重装。本机证据在 `.codex-teams/pre-push-0.2.2/`；最终提交哈希、远程一致性与 CI 结果在聊天交付中报告。

## 0.2.2 运行可感知性与本轮验收（2026-10-12）

- 用户明确要求能够确认插件是否参与、执行什么及当前进度。team 技能新增前台反馈约定：调用时查询实际版本/状态，实际启动后显示任务/模型/分工，阶段变化显示记录，结束显示结果与证据；不需要委派时明确未启动成员，不为展示活动创建任务。
- 新增 status.js 集中只读 SQLite 观察、摘要和 HTML 展示；空工作区不落库，与现有 MCP owner 可并存，不写回任务/owner、不执行崩溃恢复。MCP 仍为七工具，teams_status 新增 overview/limit；原单任务/列表与 CLI 默认 JSON 保留。
- 新 runtime 在 attempt 中保存阶段时间线，覆盖准备、成员、审计、验证、独立审查、队长复核、集成/源复验和结果；最新 attempt 门禁保留。旧 running/integrating 缺少 phase 均显示未知，不推测具体阶段。成员/reviewer 用量分别展示，未知保持 null。
- 查看工具版本/来源与记录的 owner 版本/来源分开；新 owner 记录 version/sourceRoot，旧字段保持未知，不泄露 token。pack 增加 build-info.json，仅包含版本、打包时间和源码/技能/包元数据摘要，不包含本机配置内容。
- CLI 新增 `status --human` / `--overview` / `--html <new.html>`。HTML 支持搜索、状态筛选、展开说明/阶段/结果/证据，仓库数据转义、无外部依赖/连接；明确快照时间与重新导出要求，无常驻服务或后台操作。显式新文件 wx 写入，拒绝覆盖。
- 版本为 0.2.2；新增 1 个核心 JS 文件，总计 12 个；没有新增运行依赖、前端框架、数据库 schema 版本、工具数量或权限扩张。原则文件记录本次用户授权的只读状态入口。

| 本轮检查 | 结果与证据 |
|---|---|
| 定向与写任务阶段 | 54/54 通过，含 owner 共存、只读不恢复、版本分离、转义与完整写阶段断言 |
| 首轮独立复核发现 | 旧 integrating 缺少 phase 会误显示 applying，首轮 blocked，没有验收；修复统一 unknown，并增加 verifying/applying/缺失 integration 三种回归 |
| 修复后定向检查 | status.test.js 9/9 通过 |
| 最终全量与覆盖率 | `npm run test:coverage`，147/147，0 fail/cancelled/skipped，119.32 秒；源码行 96.53%、分支 85.28%、函数 93.77%；status.js 行 100%、分支 86.76% |
| 浏览器交互 | 真实记录 4 个卡片，指定任务搜索后 1 个、展开完整说明、完成状态筛选 3 个、空搜索反馈、390px 无横向溢出；临时预览服务与页面均已退出 |
| 当前会话观察 | 新 CLI 可旁路读取当前旧缓存 MCP 的任务；viewer 0.2.2 与旧 owner 版本未知分别显示，不声称正式缓存已升级 |
| 最终包 | `dist/marketplace-v0.2.2/`；12 核心文件、技能、原则与 package 元数据字节一致，build 摘要重算一致；pre-review 包留在独立目录，不作为最终产物 |
| 实际宿主/缓存 overview | smoke-plugin.js 在临时 CODEX_HOME 安装、删除源包后缓存独立运行；空状态查询不创建 owner；实际 viewer/runtime 均 0.2.2、缓存来源明确，七工具/取消/owner 退出通过，无推理、未改用户配置 |
| 验收脚本锁竞争 | 一次退出检查遇到 database is locked；给只读 DB 加 bounded busy timeout 后通过。退出未确认时现在保留临时现场，不无条件删除目录；原失败日志保留 |
| 协议与沙箱 | 最终包 doctor --check-thread 通过，真实只读目录/权限确认；smoke-sandbox 文件/本地网络 syscall 检查通过，均无推理 |
| 团队复核 | 首轮 blocker 修复后显式 expert 重试，第二轮静态无阻塞，经队长四条原标准逐项复核后 succeeded；不以旧报告或模拟替代真实命令结果 |

本机证据：`.codex-teams/upgrade-0.2.2/`，包含 targeted.log、status-final.log、coverage-final.log、team-review.json、最终包/doctor/缓存 overview/sandbox 回执、HTML 与截图。可直接打开 `teams-status-complete.html` 查看本次完成后的真实任务快照；后续记录需重新导出。临时浏览器工具生成的未跟踪辅助文件已清理。

团队任务 `29528952-de96-46f7-8bb8-67bf048feee2`；首轮 attempt `988897ad-6a34-4b56-8fc7-94285512b84b` blocked，104.635 秒、309408 totalTokens；最终 attempt `1a022a9c-47f9-4a0c-af25-b93063be110a` succeeded，82.473 秒、238707 totalTokens。两轮实际成员执行合计约 187.108 秒；host 合计 totalTokens=548115、inputTokens=543474（其中 cachedInputTokens=463232）、outputTokens=4641。缓存包含在输入中，不重复相加；未计算费用或声称节省。

**使用边界：**当前会话仍使用用户调用路径中的 0.2.0 缓存技能/工具。本轮只准备并验证 0.2.2 包，没有改正式 Codex 插件配置；按 README 重装并开启新会话后，新聊天反馈约定/overview 才能使用。CLI 与 HTML 入口现已可用。聊天反馈依赖前台 Codex 执行技能，不能承诺宿主原生 UI、自动推送、实时网页更新或父聊天唤醒。远程 CI 四组合、真实模型写任务及复杂任务质量/效率对照本轮未执行；没有提交或推送。

## 0.2.1 升级与本轮验收（2026-10-12）（历史）

- 新 attempt 清除旧顶层 execution，保留历史 attempt；新增失败、取消和无效结果三类回归，旧回执门禁保持。
- 只读成员、独立 reviewer 与写成员统一核对宿主返回 cwd 的真实路径；错误、缺失、不可访问目录在推理前拒绝，等价 symlink 路径通过。本机 schema 的 ThreadStartResponse.required 包含 cwd。
- 协议缓冲按 UTF-8 字节限额接收；fatal/stop 清空缓冲，后续 stdout 排空丢弃，不再解析通知；TERM/KILL、进程组退出确认保留。回归包括无效帧后同批通知、多字节超限、忽略 TERM 的持续输出与退出确认。
- MCP/App Server 版本统一从 package.json 读取；package/lock 根包和两个 plugin manifest 均为 0.2.1；没有新增依赖，核心仍为 11 个 JS 文件。
- 新增 `.github/workflows/ci.yml`：ubuntu-24.04 / macos-14 × Node 24.0.0 / 24.x 四组合，锁定官方 Actions commit，安装锁定依赖后执行 `npm run test:coverage`。测试不调用模型；依赖安装仍可联网。

| 本轮检查 | 结果与证据 |
|---|---|
| 定向回归 | `node --test tests/core.test.js tests/backend.test.js`，46/46 通过，3.39 秒 |
| 全量与覆盖率 | `npm run test:coverage`，138/138 通过，0 fail/cancelled/skipped，113.69 秒；源码行 95.99%、分支 85.17%、函数 92.92% |
| 实际本机协议 | 导出当前 Codex schema；源码侧及包侧 doctor --check-thread 通过，确认真实目录、readOnly/network=false/approval=never，无推理 |
| 生产依赖插件包 | `dist/marketplace-v0.2.1/`，11 核心文件与源码逐字节一致；全量测试中的官方 SDK stdio 七工具及版本 0.2.1 断言通过 |
| 宿主安装与缓存 | smoke-plugin.js 通过：临时 CODEX_HOME 安装、删除源包后缓存独立运行、skill/七工具、调用与 owner 退出；未改用户配置，无推理 |
| 本机沙箱 | smoke-sandbox.js 通过：临时 linked worktree 内写入允许，源/外部/Git 元数据写入及本地网络拒绝；无推理 |
| CI 静态检查 | YAML 解析、四组合及命令核对通过；checkout/setup-node 固定 SHA 与官方 refs 核对；远程执行未验证 |
| 团队审查 | expert 新只读线程审查限定 diff，无阻塞，经队长四条原标准逐项复核后 succeeded；不等同于真实模型写任务验证 |

本机证据目录：`.codex-teams/upgrade-0.2.1/`，含 targeted.log、coverage.log、schema、源码/包 doctor、pack 与两个 smoke 的原始回执。该目录按既有规则忽略，不提交。

团队任务 `bcc5d16e-197e-43d9-a8c6-f5fab3b1b602`，attempt `03694b7a-4314-4157-b08d-4ec4e46ca9df`，成员 `gpt-6-astra/high`，实际执行约 112.74 秒。host totalTokens=339283，inputTokens=336920（其中 cachedInputTokens=288640），outputTokens=2363；缓存已包含在输入中，不重复计算，不据此推断费用或节省。

本轮未执行真实模型 writer/reviewer 写任务、Linux/Node 24.0.0 或远程 Actions；复杂任务质量/效率对照、执行环境预检和阶段指标仍待后续。未重装用户正式插件、提交或推送；用户当前已安装缓存需按 README 的重装流程更新。

## 0.2.0 原有交付

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

## 0.2.0 验收证据（历史）

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

## 0.2.0 本机产物与交付（历史）

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

## 升级前文档维护（2026-10-12，历史）

- README 新增“升级代码后重装插件”：版本同步、新目录打包/doctor、任务退出、插件卸载、marketplace 来源切换、重装/重启和手工 MCP 区别。
- 依据本机 CLI help 和上一轮临时 CODEX_HOME 实测：0.2.0 → 0.2.1 来源切换与重装成功，没有推理或用户配置改动。
- 本轮只改文档，检查 Markdown 代码块/命令及 git diff --check；未重跑代码测试或执行正式卸载安装。下一步仍按下文使用及评测路线推进。

## 0.2.0 GitHub 交付（2026-10-12，历史）

- 用户明确要求提交到现有私有仓库 `JokerAn/codex-agent-teams`，分支 `main`。
- 本次交付包含 0.2.0 写任务闭环、测试/实测脚本、使用文档和 README 升级重装说明；版本与 lockfile 一致。
- 提交前检查 diff 格式、凭证格式及忽略边界；`teams.local.json`、`dist/`、`.codex-teams/` 不进入提交。
- 沿用最新完整 119/119 通过记录；此后的 README/状态文档补充不改变运行代码，未重复发起模型或全量测试。
- 推送完成后的提交哈希与本地/远程一致性在聊天交付中报告。


## 升级前评估（2026-10-12，0.2.0 基线）

- 用户要求使用 team 技能评估升级方向；完成一个 expert 只读团队审查并经队长逐项复核。完整建议、证据、验收及本次 host 用量见 [UPGRADE-REVIEW.md](UPGRADE-REVIEW.md)。
- 队长本轮重新执行 `npm test`：119/119，通过，0 fail/skip，耗时约 108 秒；本轮运行代码没有修改。
- 源码复核和独立内存复现确认：失败重试可能残留旧顶层 execution；只读成员/reviewer 缺少返回 cwd 校验；协议 fatal 后缓冲可继续增长。后两项没有推断成真实宿主错目录或生产 OOM。
- 临时 Git fixture 确认 worktree 可向上读取源 node_modules，但 ignored 本地数据不复制；建议先补执行环境预检及依赖来源证据，而非隐式安装或假定依赖全部缺失。
- 建议先做 0.2.1 小范围正确性修补与离线 CI，再做环境预检、阶段用量/错误分类、同条件质量效率评测及包来源追踪；这些版本为计划，当前仍为 0.2.0。
- 本轮只改评估/状态文档，未重装插件、修改用户配置、提交、推送或运行付费写任务长跑。完成后检查 diff 格式与文档链接；新增回归、实际宿主异常、跨平台和对照评测仍待后续执行。

## 下一步

0.3.0 模型发现、用户确认和简单/复杂任务分工已完成本机回归与临时宿主协议验证。新包按 README 重装后由用户实际选择模型；当前会话尚未切换。远程四组 CI 通过属于 0.2.2 历史，0.3.0 未运行远程 CI。后续继续完善目标工作区匹配、环境预检、错误分类与质量/效率评测，保持小型单链路。
