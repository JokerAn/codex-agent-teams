# 当前状态

## 0.8.0 默认流程精简完成（2026-10-15）

用户授权按精简计划实施。当前交付见 [精简记录](SIMPLIFY-0.8.0-2026-10-15.md)、[结构化证据](SIMPLIFY-0.8.0-2026-10-15-EVIDENCE.json) 和 [TODO](TODO-UPGRADE-2026-10-15.md)。旧章节的默认外置路径为历史行为。

- 默认team改为19行原生协作skill；默认build/update/CLI pack只产出skill与元数据，**4文件3052字节**，不带MCP/hooks、源码、node_modules、本机配置或绝对可执行路径。构建不安装依赖、不发现模型、不起App Server；实际宿主中0外置MCP/0插件hooks/无项目状态库。
- 原严格指南移到strict-delivery；`--strict`显式包保留原8工具/3种hooks与执行、退出、审查/集成门禁。没有新原生后端或双后端调度器。严格模块仍在仓库，默认安装已移除它们的运行负担，不宣称全部代码复杂度已消除。
- 原生独立审查发现CLI pack提前静态导入严格模块，队长改为按命令延迟加载并补完整src/空PATH/无node_modules回归，成员限定复核无新增阻塞。native_package_review经原生工具派发，未通过Agent Teams MCP；队长独立核对证据。
- 首轮定向48/49，失败是受控Windows测试argv写法；修正后最终定向 **65/65**，14868.919708ms；最终全量 **339/339**，0 fail/cancelled/skipped，97725.593709ms，Node v24.21.0/macOS。日志 `/tmp/teams-slim-targeted-final-20261015.log`、`/tmp/teams-slim-full-20261015.log`；首轮及CLI反例日志保留。
- 本机官方临时宿主确认原生缓存skill可在来源移除后发现、无外置服务，测试客户端退出。严格包临时宿主旧能力保持；官方CLI双向切包、同版本替换与失败恢复39次调用通过，正式配置未改。默认实际npm build通过。quick_validate缺Python yaml，未安装；独立frontmatter/真实发现与行为检查通过，未冒称官方校验器通过。
- 两组同文件/需求/模型的微型审查中，原生和严格均找对quantity=0及路径边界问题，队长独立输入断言通过。原生原始任务范围有歧义，补2次skill读取澄清；严格报告用时41129/27342ms、退出确认。缺可比原生时间、缓存/顺序控制，严格为内存store且不含公共MCP流程，不计算速度/费用优势。临时样本目录已清理。
- 最终原生包 `dist/marketplace-v0.8.0-native-final-20261015`，严格包 `dist/marketplace-v0.8.0-strict-final-20261015`，身份和大小见证据。默认update会替换旧严格安装；需要旧工具显式--strict。当前已加载/正式安装未改，不热更新。
- 实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `af6d79b`，index tree `227dbb151a1c80b448b9741c143426a401a7c0f6` 保持；本轮源码/测试/文档未暂存，未commit/push/正式安装/清理历史状态，无跨worktree未同步。格式/链接/围栏、四处版本与lock根版本、两种最终产物对应源码/技能一致性、index核对通过；本轮执行会话均已退出，原生成员完成，临时home和样本清理。

## 后续方向转向精简验证（2026-10-15，仅调整计划）

用户进一步提出插件过重、收益未达预期，要求考虑精简方向。计划/ROADMAP/TODO已把“原生子Agent＋短skill的普通协作验证”置于后续首位，外置严格交付按实际证据需求评估保留，不新建双后端调度；归档、页面和并行写等扩展后置。先用少量匹配任务比较质量、交付耗时和人工投入，再决定模块退役，不能以删除行数或历史数据量替代效果。

本轮未改运行代码/skill/配置、未启动成员/模型/测试或删除数据。0.7.0交付及未测边界保留，已安装行为不因计划修改自动切换。实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，用户现场HEAD已为 `af6d79b`，index tree `227dbb151a1c80b448b9741c143426a401a7c0f6` 保持；仅本轮计划文档未暂存，无跨worktree未同步、commit/push或安装。

## 产品定位与原生子Agent对照（2026-10-15，仅分析）

用户明确原始目标是让Codex开子Agent并行做事，质疑多轮插件迭代的增益。主Agent直接核对官方原生Subagents/App Server文档、当前关键调用链和本会话证据，未启动新成员或测试。完整依据与建议见 [产品方向分析](PRODUCT-DIRECTION-2026-10-15.md)。

- 当前插件已成为外置执行与交付验收系统：真实增益是合同/持久attempt、文件与日志指纹、独立工作区、命令/reviewer/队长/集成复验及退出保障；原生已有派发/并行/模型强度/后续指令/汇总，单纯开子Agent并非独有价值。
- 主要错位：拆分仍靠队长；带写计划任务仍独占；成员主动关闭继承MCP/apps/web并限制验证方式；一次turn报告后关闭客户端，无持续成员修复入口；合同/轮询/复核和重建上下文提高协作成本。模型启动开销未单独测量，不将全部执行时间归因于它。
- 本会话成员确实找到缺陷，但未与原生同条件比较；334/334和小型真实写闭环不能证明加速。建议常规任务优先原生+短skill，现有严格执行链路按确切交付/审计需求启用；先测收益，再决定扩展。此为建议，未自动变更现有运行策略或实施原生后端重构。
- 本轮仅新增分析/更新状态，未改运行代码/skill/配置、未清理/commit/push。实际主目录，本轮文档未暂存；当前观察index tree `227dbb151a1c80b448b9741c143426a401a7c0f6`（用户现场已不同于上一轮历史树），保持该现场，不回退。

## 0.7.0 A/B修补与本机候选交付（2026-10-15）

用户授权按计划列TODO并开始修复。已交付 [执行清单](TODO-UPGRADE-2026-10-15.md)、[完整记录](UPGRADE-0.7.0-2026-10-15.md) 和 [证据JSON](UPGRADE-0.7.0-2026-10-15-EVIDENCE.json)。A/B源码与本机候选完成，C部分完成；下方“计划待实施”“B1/B2未修”均为此前历史时点。

- A1/B1：启用hooks的路由MCP中start/integrate显式workspace，hook不回退聊天cwd；schema/说明/skill/README/示例同步，其他已知taskId查询与无hooks/legacy合同保持。公共输入收紧，版本统一0.7.0。
- A2/B2：成功/回退共用实际关键文件、缺失状态、普通文件/父symlink与完整launcher执行位掩码。真实官方CLI list无installedPath，补effective Codex home内明确插件/版本路径的身份读取，不扫描其他缓存；临时CLI首次安装/替换/失败内容恢复25次调用通过。无旧身份仍明确未确认，运行依赖未逐文件校验。
- B3/B4/B5：项目累计/显式选定任务/历史折叠、先过滤再limit、连续显示更多；summary/catalog可选投影，旧overview/verbose/增量兼容；skill收紧材料读取和交接。真实浏览器25/80条合成记录检查通过，预览页/服务已关闭。选定集合不冒充自动会话归属，不删除历史数据。
- 独立只读GPT-6.1 Sol/high，captain-explicit，task `492608dc-5241-40b9-bf2c-e170482424c1`，attempt `5a0aaedd-76ee-4650-825c-1f6244a2639c`，312.552秒、退出确认。发现owner执行位漏检和显示更多停在40；队长先新增两项失败反例，再最小修补并独立验证，逐项review(pass)，报告succeeded。成员未复验最后修补，不声称其验证最终源码。
- 最终定向 **90/90**，15531.48475ms；最终 `npm test` **334/334**，0 fail/cancelled/skipped，93357.435333ms，Node v24.21.0/macOS。日志 `/tmp/teams-upgrade-070-targeted-final-20261015.log`、`/tmp/teams-upgrade-070-full-final-20261015.log`。早期330/330、两项反例失败、临时CLI路径/元数据恢复失败日志保留，详见交付记录。
- 最终候选 `dist/marketplace-v0.7.0-verified-20261015`，digest `912d87efb306ed4dba07f9dc59b9e9db35a8385637b59989b44bddeaa7d9bc03`。24源码与关键定义逐字节一致，最终SDK八工具/1选定与13累计/监听退出、doctor只读线程、官方临时宿主hooks发现及owner退出通过，无推理样例summary1019/catalog3750字节。首轮candidate保留，不作为最终包。
- 最终候选一次真实writer+fresh expert reviewer（krill/gpt-6.1-sol/high），**66.893秒通过**：命令前后3项断言、captain复核、显式集成、源复验，HEAD/index与用户既有改动保持、managed worktree清理。task `7ca3c6f4-c8a6-4e43-8e43-073ee1433d51`，证据 `.codex-teams/live-write-77d3b837-8850-4636-84bb-7031621ff4f2/`。是有界功能验收，不是效率对照或桌面按钮验收。
- 未执行正式update/用户hooks信任、真实桌面停止、当前远程平台矩阵、效率长跑、commit/push或历史清理。当前聊天仍加载0.6.3；下一步结束相关Team会话后显式update、重开会话核对0.7.0，再安排桌面停止与远程/效率证据。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；本轮新增代码/测试/文档未暂存，开工index tree `c6e7b068a73edc1313595a53c7872413f0bf172f` 保持，无跨worktree未同步。文档格式/链接/围栏、四处版本与lock根版本、最终候选源码/定义逐字节一致、index及本轮预览服务退出核对通过；用户既有暂存diff格式也通过。

## 当前升级计划已统一（2026-10-15，尚未实施新增修补）

用户要求综合最新代码审查、真实使用与13条记录问题更新升级计划。主Agent直接完成文档整理，未启动新成员。根 [UPGRADE-PLAN.md](../UPGRADE-PLAN.md) 现为唯一当前实施入口；旧689行计划正文完整保留到 [历史计划](UPGRADE-PLAN-HISTORY-2026-10-15.md)，ROADMAP同步批次与依赖。

- A先修两项P2：带hooks的路由start/integrate显式workspace，配套schema/调用说明/兼容迁移；更新成功与回退统一启动关键文件、类型和执行位校验。B1/B2仍未修复。
- B处理项目累计/本次选定任务/历史折叠、可选精简摘要/目录返回与skill交接纪律。真实会话视图依赖已确认host归属，不猜最近聊天；持久归档后置，不清空数据库或改历史失败为成功。
- C区分定向/全量回归、独立复核、候选与正式缓存交接、真实桌面停止/写闭环及既有平台矩阵；D再做有预算边界的同条件交付测量，按证据决定摘要/工具白名单/并行写。
- 本次仅改计划、ROADMAP、STATUS并保存历史文档；未改运行代码/测试/版本、未新运行312项回归或真实模型、未update/清理数据/commit/push。上一轮312/312和复现仍为既有证据，不称本轮重跑。
- 实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`，本轮文档未暂存，原暂存树 `c6e7b068a73edc1313595a53c7872413f0bf172f` 保持，无跨worktree未同步。文档格式、链接、代码围栏与index核对通过；历史归档仅调整三处相对链接，反向归一后SHA-256与归档前相同，正文完整性确认。

## 本会话真实使用与13条记录释义（2026-10-15）

用户询问截图任务总数和实际使用问题。只读MCP快照 `2026-10-15T02:51:08.915Z` 确认：13为项目累计任务，本轮只创建1个、此前12个；当前running=0、awaiting=0、succeeded=10、attention=3。安装cache来源、持久任务历史、模型缓存输入是不同概念；没有依据把历史记录直接判为垃圾或残留运行。本轮未删除数据库、缓存、worktree或日志，未启动新成员。

产品改进优先补“项目累计/本次会话”的明确口径与筛选、历史折叠/归档，旧失败保留原始终态；再精简overview中的长详情。真实委派产出B1且队长独立复现，有质量收益，未证明提速。队长首轮读历史过宽导致截断，观察也带出不必要详情，需要缩小检索与交接范围。完整依据与建议补入 [本轮报告的真实使用复盘](AUDIT-0.6.3-2026-10-15.md)。本续问仅补文档、未暂存，既有index保持，无源码/正式配置改动。

## 0.6.3 当前代码再次复查（2026-10-15）

本轮只做审查和文档记录，未修改运行代码。主目录当前工作树确认两项尚未修补 P2，完整触发、复现、证据边界及验收见 [AUDIT-0.6.3-2026-10-15.md](AUDIT-0.6.3-2026-10-15.md)。本轮范围未确认 P0/P1，历史 H1/H2/U1 不重复列为待修。

- B1：聊天 cwd=A、已知任务属于B，start/integrate 省略 workspace 时，hook 把A作为明确目标而拒绝合法调用。成员提出纯内存反例；队长用当前 hook/lifecycle/router、临时双项目和真实socket独立复现两个入口，显式传B均allow。影响是调用受阻，无错项目执行证据。
- B2：更新成功路径未比较启动器与MCP/运行配置；队长将临时cache的 mcp-launch.js、.mcp.json、teams.config.json 分别改成无效文本，当前installPreparedPlugin三次仍返回成功。受控CLI复现，不代表正式安装已损坏；最小修补是补齐关键文件比较与针对性回归。
- 当前实际 viewer/runtime 已为 **0.6.3**，缓存来源0.6.3，build digest `571dba09c9f00c0e7b484238614533f292e4ef68f6a18bcf2215a2aad32eb62b`；旧段“仍0.6.2”为历史时点，本轮未执行更新。此快照未代替逐文件缓存核验。
- 队长全量 `npm test` **312/312**，0 fail/cancelled/skipped，101436.099584ms，日志 `/tmp/teams-audit-20261015-tests.log`。两项独立复现通过，临时fixture清理；真实桌面停止、当前版本真实writer/reviewer/集成、Linux/远程CI及效率对照未执行。
- Team独立只读成员GPT-6.1 Sol/high，captain-explicit，task `792a91b8-951d-478d-b953-39366efe94cf`，attempt `34b0cea6-982d-468c-85c0-e0ba9dc19495`，193.938秒、退出确认；队长独立复现并逐条review(pass)，报告succeeded，不代表缺陷修复。B2为队长独立检查范围。
- 下一步先小补丁修B1/B2，再完成当前版本真实宿主停止/写闭环及既有平台矩阵，然后同条件效率测量，按数据决定发现摘要、工具白名单与有限并行写。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；仅文档未暂存，既有暂存树 `c6e7b068a73edc1313595a53c7872413f0bf172f` 保持，无跨worktree未同步、commit/push/update或正式配置修改。

## 0.6.3 定点修复交付（2026-10-15 收尾）

用户授权定点修复，主 Agent 直接完成，没有启动新成员。源码版本已同步 0.6.3，完整实现、回归与边界见 [FIX-0.6.3-2026-10-14.md](FIX-0.6.3-2026-10-14.md)。下方“尚未修补”均为此前审查时点。

- H2：待用票据与已接受 attempt 的中断归属分开；start/integrate 成功后才提交，重复启动、无效模型和过期集成失败保留原归属。H1：端点清理核对自身 token/socket，缺失可补发，生产关闭先撤销端点再释放 owner。
- U1：更新前保存旧缓存关键文件身份，回退后重新核对；同版本内容漂移明确报告恢复未完成，legacy 无身份信息只报告元数据恢复、内容未确认。运行依赖未逐文件哈希，回执明确该边界。
- teams_review 默认仅返回精简回执，完整报告和证据仍可由 status(verbose=true) 查询；保留运行时逐项验收及写任务门禁。README/skill/路线图同步，包、lock、两 manifest 均为0.6.3。查阅官方 MCP 2025-11-25 tools 规范，继续使用现有 text content 结果，不改变工具输入合同。
- 定向38/38，5912.771459ms；全量 `npm test` **312/312**，0 fail/cancelled/skipped，90004.910208ms，Node v24.21.0/macOS。日志 `/tmp/teams-063-targeted-final-20261014.log`、`/tmp/teams-063-full-20261014.log`。首轮定向37/38仅新测试的尾空格预期错误，修正测试输入后通过，原失败日志保留。正式与暂存 diff 格式检查、文档链接和版本一致性检查通过。
- 未执行正式更新、真实模型、桌面停止、Linux/远程CI或效率评测；当前已加载缓存仍为0.6.2。下一步结束相关Team会话后显式update、重启新聊天核对0.6.3，再做有界真实停止/写闭环验收。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；本轮源码/测试/文档未暂存，原暂存树 `91e10ffbec423925a342dc7437bceeb0d3218ff4` 保持，无跨worktree未同步内容、commit/push或正式配置修改。

## 当前聊天 Team 使用复盘（2026-10-14）

用户要求回顾上一执行轮的插件问题。本轮主 Agent 直接复盘，未启动新成员、修改运行代码或重复全量测试；详见 [TEAM-SESSION-RETROSPECTIVE-0.6.2-2026-10-14.md](TEAM-SESSION-RETROSPECTIVE-0.6.2-2026-10-14.md)。

- 区分发现与实际触发：上一轮真实成员正常完成并确认退出，H1/H2 由受控复现确认，不声称真实委派时已触发；U1 未通过正式 update 触发。模型选择/报告/复核链路有效，报告351.3秒、之后约80.8秒完成队长独立复现和验收，有质量产出但没有提速对照。
- 产品问题：teams_review 默认返回完整任务，重复前一步已读取的报告/历史；观察中缺少有界发现摘要，队长仍需前台轮询。调用问题：队长拿到游标后仍多次使用普通wait，且读取历史文档过宽、提前重复部分成员探索。先精简回执和使用增量观察，不增加成员数量来补偿。
- host 成员累计782303 tokens（含683904 cached input，output10264），不是一次新提示长度；缺少主线程、价格、对照，不推算整轮费用或效率收益。成员首次heredoc受只读shell限制，改node -e后检查成功，不作为插件启动失败。
- 实际交付主目录，仅新增复盘及更新本文件，本轮未暂存，既有暂存区保持；无commit/push/update、新模型调用或跨worktree未同步交付。

## 0.6.2 当前缺陷与待办复查（2026-10-14）

用户询问尚存 bug、升级点和待办。本轮审查当前主目录工作树，未修改运行代码；完整触发、复现、证据边界及验收清单见 [REMAINING-WORK-0.6.2-2026-10-14.md](REMAINING-WORK-0.6.2-2026-10-14.md)。

- 确认三项 P2：H1 交错重连时旧 lifecycle 可删除新端点且 publish 不补发；H2 失败 start 仍覆盖既有待验收 attempt 的中断归属；U1 更新回退仅比较版本/启用状态，同版本内容不同仍误报完整恢复。成员提出 H1/H2，队长以当前真实函数、临时文件/socket 和内存 TaskRuntime 独立复现；U1 由队长注入受控 CLI 复现。均未修补；未确认 P0/P1，真实双 MCP 竞态和桌面操作未实测。
- 当前 viewer/runtime **已为 0.6.2**，缓存来源 `/Users/anshunli1/.codex/plugins/cache/codex-agent-teams-local/codex-agent-teams/0.6.2/`，build digest `7c003054d72675adf22c64824af8f43da8b0add9be6ecdc4cbbcd7a61d37f2d3` 与最终候选记录一致。下方“正式安装未更新”是历史时点；本轮未执行安装。D1/P3 是文档状态漂移，升级计划中的旧 CLI 无进度等说法也不能用作当前待办。
- 队长本轮 `npm test` **306/306**，0 fail/cancelled/skipped，84523.285167ms，Node v24.21.0/macOS，日志 `/tmp/teams-current-audit-20261014-tests.log`。三项复现成功说明现有绿测未覆盖这些边界；没有宣称真实模型写闭环或 UI 验收完成。
- 使用 team skill/Agent Teams MCP，一名独立只读 GPT-6.1 Sol/high 成员，captain-explicit；task `5532ba0f-a3e0-459e-a064-aa3cb0038df7`，attempt `b7bbf832-ec18-4fc9-a066-2fc87f36d302`，351.3秒，退出确认。队长独立复现并逐项 review(pass)，终态 succeeded，仅表示审查报告验收。
- 下一步先修 H2/H1/U1 并补定向回归，再做真实桌面停止、当前版本 writer/reviewer/集成闭环及远程平台矩阵；随后以同条件质量/效率数据决定摘要、工具白名单和有限并行写。历史 F1/F2/F3、A1–A4 等已修问题不重复安排。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；只新增报告并更新本文件，本轮文档未暂存，原暂存树 `91e10ffbec423925a342dc7437bceeb0d3218ff4` 保持，无跨 worktree 未同步、commit/push/update或正式配置修改。

## 0.6.2 委派规则与停止联动修复（2026-10-14）

用户已授权按排查文档实施，源码和最终候选已交付；正式安装未更新。完整实现、协议依据、独立复核、失败历史与边界见 [STOP-FIX-0.6.2-2026-10-14.md](STOP-FIX-0.6.2-2026-10-14.md)。旧章节“尚未修复”是此前时点。

- team skill 收紧普通探索委派条件，明确队长立即执行的独立产物、首答优先、成员工具边界及0/1/2成员示例；并发2不是强制人数。running反馈提醒队长继续自己的交付，未声称实现模型收益自动判断或同条件加速。
- 官方 PreToolUse/Interrupt/SessionEnd 命令hooks通过连接内控制器绑定真实session/turn、一次性票据和attempt。缺绑定拒绝插件start/integrate；中断先落标记，防迟到启动和跨轮误停；取消等待成员/reviewer/验证退出，端点不可达提示未知。重连先零等待调用恢复owner/端点，纯status/models仍不取得owner。
- 成员及验证统一进程守护，私有管道EOF覆盖MCP单独SIGKILL，整组TERM/KILL及退出门禁保持。受控实际OS信号回归确认忽略TERM的同组后代也退出；不覆盖自行脱离组、同时强杀守护或系统故障，不把请求停止当退出成功。
- 两个独立只读报告均GPT-6.1 Sol/high、captain-explicit，经队长逐项复核succeeded：协议204.0秒、补丁审查279.5秒。审查提出三项边界，队长确认修补并补回归；报告验收不是成员复验最终代码。未复制父聊天历史，无并行写成员。
- 最终标准 `npm test` **306/306**，0 fail/cancelled/skipped，85964.450834ms，Node v24.21.0/macOS；日志 `/tmp/teams-stop-npm-final-20261014.log`。定向35/35、兼容打包/构建/更新24/24、末次更新11/11分别通过。原高并发两轮出现就绪/命令时限失败，日志保留；测试/覆盖率脚本固定并发4，未减少用例。
- 本机 `0.162.0-alpha.17.2` 四种manifest真实协议对照确认portable入口丢失hooks摘要，最终本机包仅使用官方Codex兼容入口，源码portable定义保留。真实临时宿主缓存检查通过：三个hooks同时出现在plugin/read和hooks/list，MCP八工具/skill/双项目/无绑定门禁/退出通过，无推理、无正式配置变更、未代用户信任hooks。真实桌面点击停止仍未验收。
- 最终候选 `dist/marketplace-v0.6.2-stop-verified-20261014`，28文件逐字节一致，digest `7c003054d72675adf22c64824af8f43da8b0add9be6ecdc4cbbcd7a61d37f2d3`，无推理doctor和只读线程检查通过；先前候选保留，不作为最终交付。更新会核对hook文件，并拒绝残留root manifest遮蔽。quick_validate缺PyYAML，未自动安装依赖；独立skill入口字段检查通过。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`，本轮新增修改未暂存，原暂存树保持 `1d66c24c8d6ca5dc6f6f7f78d1a0efa625442afb`，无跨worktree未同步、commit/push或正式update。下一步用户结束Team会话后显式更新、重启并信任全部hooks，再做实际按钮有界验收；真实写闭环/其他模型/Linux及远程CI/同条件效率仍单独处理。

## 强行停止与成员退出核查（2026-10-14）

用户明确预期：停止自己的任务时，所属成员子进程也应停止。详细入口/代码/证据补入 [委派排查报告](DELEGATION-AUDIT-2026-10-14.md) 末节。本轮仅核查并补文档，未修运行源码。

- 原真实聊天轮interrupted后成员仍执行，最终awaiting_review，不满足用户停止联动预期。当前shutdown跟随MCP断连/信号，并没有宿主父轮停止绑定；应先核实官方宿主事件和任务归属，不能取消连接内其他任务来替代。
- 临时实验使用当前TaskRuntime/serve/CodexBackend和受控hang协议成员，SIGINT、SIGTERM、stdin EOF均确认父进程及成员组退出；直接SIGKILL父MCP时，受控detached成员仍存活，证明现有代码无法保证父骤死后子进程退出。实验残留全部手动清理并确认退出，临时文件删除。没有强杀真实Codex、取消原聊天或运行模型；不宣称真实App Server每次父骤死都残留。
- 现有清理/断连/验证/TERM升级/子孙管道定向受控回归 **6/6 pass**，0 fail/cancelled/skipped，1581.606625ms，Node v24.21.0。普通清理链路有效；聊天停止联动及父骤死保障仍未实现。下一步先实现有归属的停止联动，再按必要性设计父死亡监护，保持退出未确认禁止重派。
- 交付主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`，本轮文档未暂存，既有暂存树保持 `1d66c24c8d6ca5dc6f6f7f78d1a0efa625442afb`，无跨worktree未同步、commit/push/update或正式配置修改。

## 委派收益与队长等待排查（2026-10-14）

用户指定“追踪企融险 AI 审核入参与落库调用链”聊天，要求解释模型/分工说明、单成员是否值得启动以及队长等待问题。完整证据、代码定位、决策案例和待办见 [DELEGATION-AUDIT-2026-10-14.md](DELEGATION-AUDIT-2026-10-14.md)。本轮由主 Agent 直接检查，未启动成员；只新增报告并更新状态，运行源码不变。

- 聊天实际有两次不同 taskId 的 create/start，均 group/auto-gpt-6-1-sol/high，队长随后继续读取 AI 源码；主轮 interrupted、206642 ms，可见记录无 teams_wait 或最终验收。expert 是模型角色，并非成员数；启动前原句来自 skill 的分工/来源反馈要求。第一成员约主轮开始129秒后启动，第二成员晚59.212秒，整段包含规划、检索和往返，不能全算启动开销。
- 源码 start 启动 execute promise 后立即返回，允许队长工作；委派收益只在 skill/PRINCIPLES 文字中，contract/start 不检查队长独立交付。running 回执统一建议等待、成员 commentary 不交接、只保留动作元数据，可能增加等待及重复探索；成员线程关闭插件/全部继承 MCP，能力匹配需事先说明。
- UTC 09:23:31.665 的原项目只读 overview：实际 viewer/runtime **0.6.1**，owner存在，两成员 running，281.4/222.1秒，退出未确认；有宿主中断之后的命令完成事件。此前“正式缓存仍0.6.0”属于历史时点。宿主中断不等于MCP连接关闭，生命周期绑定尚未实现；未擅自取消其他聊天任务。该快照用量无完整主线程/价格/对照，不能证明费用或速度收益。
- 下一步优先收紧 skill 的普通探索委派条件、区分成员阶段和队长行动、明确中断后的成员处置；再按需做有界发现摘要/显式工具能力白名单，最后同条件评测。单成员在队长并行工作或独立审查时有价值，唯一任务委派后只剩等待应直接处理；不新增强制人数或重复调度推理。
- 本轮结束前原项目 compact 列表两任务均 awaiting_review，尚未验收成功；没有代原聊天 review(pass)。现有并发/短wait/取消容量和继承MCP关闭定向受控回归 **2/2 pass**，0 fail/cancelled/skipped，166.70425ms，Node v24.21.0，无真实模型推理；git diff --check、报告20个源码定位及STATUS链接检查通过。实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`；本轮文档未暂存，保留既有暂存树 `1d66c24c8d6ca5dc6f6f7f78d1a0efa625442afb`，无跨 worktree 未同步，未改运行代码/正式配置/缓存、commit/push或运行新模型。

## 0.6.1 一键更新命令（2026-10-14）

用户要求在 package.json 提供 `npm run update`。已增加 `scripts/update.js`，复用现有 build 完成锁定依赖安装、唯一新目录打包和无推理 doctor；通过官方 Codex CLI 切换本地来源、重装插件，核对实际缓存版本、digest 和源码/技能文件。README 已补一键使用及参数；PRINCIPLES 记录只有显式执行 update 才安装，build 行为不变。

- 更新前只读检查本项目 owner、未完成交接、成员/reviewer/验证退出记录；安装前再检查一次，不获取 owner、不恢复或改写任务。其他项目无法自动检查，需先结束 Team 会话。非本地同名来源、其他已安装插件或禁用安装拒绝覆盖；首次安装也支持。
- 构建/检查失败不触碰来源和安装。切换/安装/缓存核对失败时尝试恢复原来源及插件版本/启用状态，恢复失败明确报告；新旧包保留，项目任务数据不删除，不自动重启、提交或推送。
- 定向 update/build 12/12，3964.119667 ms；后补构建失败门禁，最终 `npm test` **295/295**，0 fail/cancelled/skipped，80091.945 ms，日志 `/tmp/teams-update-full-20261014.log`。覆盖首次安装、替换、带引号路径、source/install/cache 故障、回退失败、owner/退出门禁及构建失败。
- 真实临时 Codex 用户目录验证：官方 CLI 30 次调用，首次安装 0.6.1、旧版替换 0.6.1、受控安装失败后恢复 0.6.1 来源/缓存均通过；未运行模型推理。回执 `/tmp/teams-update-real-smoke-20261014.json`。受控回归和真实 CLI 证据分开，不宣称运行了用户正式 update 或模型任务。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；开工原暂存树 `463c9e44603670fe0b25b69cf83d4bf1905b2a4e` 保持，本轮新增修改未暂存，无跨 worktree 未同步，正式配置/缓存未更新。用户结束 Team 会话后可直接执行 `npm run update`，成功后重启 Codex 并开启新聊天。

## 0.6.1 启动卡点修补与候选复验（2026-10-14）

用户要求先修会反复失败的卡点。详见 [STARTUP-FIX-0.6.1-2026-10-14.md](STARTUP-FIX-0.6.1-2026-10-14.md) 和 [证据 JSON](STARTUP-FIX-0.6.1-2026-10-14-EVIDENCE.json)。源码与候选已验证，正式安装的自动审批要求明确用户授权，替换未执行，当前聊天旧 MCP 尚未更新。

- 确认主目录 schema 已修、正式 0.6.0 缓存仍缺 required limitations，marketplace 仍指向 dist/marketplace-v0.6.0。主 Agent 直接处理，没有启动新项目审查成员，不重复已知错误请求。
- 新增本地生成 schema/验收条件检查，提前到子进程/launch/turn 创建前；官方 codexErrorInfo=badRequest 单独归类并指引先修原因和核对缓存。未知错误保留原消息与通用分类，未自动重试/降级。package/lock/两 manifest 同步 0.6.1，含既有 S1/S2/S3。
- 受限环境定向 92/93（POSIX launcher 等待退出超时）；沙箱外同项 1/1，最终 `npm test` **285/285**、0 fail/cancelled/skipped、81193.436333 ms。日志 `/tmp/teams-061-blockers-full-20261014.log`，环境边界保留，不把初次失败删除。
- 候选 `dist/marketplace-v0.6.1-blockers-20261014`，24 文件逐字节一致，digest `ede7058f95b8f05dabc74587ffa273dd8de72c4095fd9eb1525884cec962ca80`。真实无推理 doctor、官方 SDK 8 工具和版本/digest、临时宿主缓存独立/skill发现/MCP ready/双项目路由均通过；没有修改正式配置。
- 最终候选的一次真实 schema 兼容请求：krill/gpt-6.1-sol/high，8722 ms，返回含全部五个 required 字段的合法报告，cleanupConfirmed=true，host totalTokens=10890。是单次有界模型验证，不是新代码审查、写闭环或收益评测。
- 正式替换被自动审批拒绝，依据 AGENTS.md:13 要求用户明确授权；安装脚本未执行，marketplace 与实际 0.6.0 缓存保持。下一步取得该授权后使用官方 CLI 替换、核对缓存 digest，并重建旧 MCP 会话；不绕过审批或盲目重试。
- 实际交付主目录，HEAD `25e15c7`、原暂存树 `e6ee32da47d9abc4450c413a53d8e97d4fee657d` 保持；本轮新增改动未暂存，无跨 worktree 未同步，未 commit/push/发布。真实 writer/reviewer 写链路、其他模型、远程 CI 和桌面热重载均未追加验收。

## 0.6.0 源码真实复验与续查（2026-10-14）

接续上一轮记录，完整分工、13 次源码 MCP 回执、复现、局限及升级验收见 [SESSION-AUDIT-2026-10-14-FOLLOWUP.md](SESSION-AUDIT-2026-10-14-FOLLOWUP.md)，原报告与逐项验收见 [证据 JSON](SESSION-AUDIT-2026-10-14-FOLLOWUP-EVIDENCE.json)。旧章节“真实复验待执行”是此前时点，本轮仅补齐源码的真实只读复验，正式缓存仍待交接。

- 已安装 MCP 为 0.6.0，缓存 contracts 仍缺 required limitations。未重复发起已知错误请求；用当前源码、官方 MCP SDK Client/InMemoryTransport 和真实 Codex App Server 建立临时连接，沿现有项目 owner/状态门禁运行一个只读成员，正式缓存/配置不变。
- task `2d4b1c08-bcc1-4ce2-97a5-995dec144ec2`，attempt `9690fe91-50f4-4e50-b254-1e8149ef0b23`，krill/gpt-6.1-sol/high、captain-explicit，196426 ms，返回含 limitations 的报告、cleanupConfirmed=true。队长核对原两条 acceptance 并原生 ESM 独立复现后 review(pass)，终态 succeeded。证明该模型上的源码 S1 真实只读请求接受，不代表正式缓存升级或写闭环。
- 新确认 S3/P2：独立审查期间 changed lastAction 仍指向写成员旧动作。`src/observation.js:35` 现在按 machineReview 选 reviewer journal，空 journal 不回退旧动作，并带 lastActionRole；覆盖开始/结束、空动作、完成报告、普通成员及 unchanged。成员审查修补前源码，最终补丁由队长回归验收。
- 补齐协议测试缺口：fake App Server 递归检查每层 object 的 required/additionalProperties，正常返回 limitations=[]；新增顶层 limitations 和嵌套 evidence 缺 required 的拒绝回归。生产 S1/S2 修补已在开工暂存内容中，本轮未重复改动。
- 定向 80/80，5675.813583 ms；全量 `npm test` 281/281，0 fail/cancelled/skipped，72469.240333 ms，Node v24.21.0/macOS。日志 `/tmp/teams-source-audit-targeted-20261014.log`、`/tmp/teams-source-audit-full-20261014.log`。模拟协议/真实本机命令与本次真实模型读任务分别记录。
- 局限：历史 workspace 变化未进入游标摘要仅为条件反例，正常触发路径未确认；页面打开 queued、可见性未验收；8 条动作只存元数据；host 累计 494014 tokens 无主任务同口径/价格/对照，不宣称效率或费用收益。未跑真实 writer/reviewer 写闭环、其他模型、远程 CI 或长跑。临时连接、owner 与 panel 已退出。
- 下一步：准备包含 S1/S2/S3 的 0.6.1 候选，授权缓存升级后核对实际 build/source，再做有界真实复验；错误分类、真实 reviewer 动作归属与写闭环按独立验收推进。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；原暂存树 `e6ee32da47d9abc4450c413a53d8e97d4fee657d` 保持，本轮改动未暂存，无跨 worktree 未同步，未 commit/push/发布/更新正式缓存。

## 0.6.0 实际使用排查与会话审查（2026-10-14）

用户要求排查 bug/升级需求并详细记录本轮会话，以实际使用审查插件局限。完整合同、工具回执、时序、复现、局限及升级验收见 [SESSION-AUDIT-2026-10-14-0.6.0.md](SESSION-AUDIT-2026-10-14-0.6.0.md)。本轮对确认的 S1/S2 做了最小源码修补并完成离线回归，真实模型复验仍待执行。

- S1/P1（已修补，待真实复验）：两个真实只读成员都被模型服务拒绝，错误为 output schema 的 required 缺少 limitations。`src/contracts.js:92` 现在仅在生成 schema 时补 required，旧报告解析仍接受缺字段；新增回归通过。当前 krill/gpt-6.1-sol/high 的修补前启动受阻，其他模型未逐一运行；writer/reviewer 同入口影响为静态判断。
- S2/P2（已修补）：增量 status 的文字回执曾省略 JSON 已有的错误、下一执行者和具体下一步；`src/status.js:180-187` 现在在首次/changed 回执带有界字段，unchanged 保持精简。新增回归和全量测试通过，原状态/错误没有丢失。
- 两任务 `b82265a0-8978-4b4d-8f38-b805520460ea` / `690f22eb-ea7b-40ae-98b9-74cd5cb3b348`，均 krill/gpt-6.1-sol/high、captain-explicit，耗时 1243/1553 ms，failed，cleanupConfirmed=true。没有报告、用量或独立审查结果；没有 review(pass)、自动重试或降级。队长负责复现和报告，不将成员失败算审查成功。
- 当前已安装 MCP viewer/runtime 均为 **0.6.0**，来自 `/Users/anshunli1/.codex/plugins/cache/codex-agent-teams-local/codex-agent-teams/0.6.0/`。下方“仍为 0.5.2”属于历史时点；本轮未更新缓存。面板成功返回，宿主打开请求为 queued，未确认页面已展示。
- 修补前定向 69/69；修补后定向 `node --test tests/core.test.js tests/backend.test.js tests/actions.test.js tests/observation.test.js tests/mcp.test.js` 为 **83/83**，日志 `/tmp/teams-session-fix-targeted-20261014.log`；全量 `npm test` 为 **278/278**，0 fail/cancelled/skipped，64781.7765 ms，日志 `/tmp/teams-session-fix-full-20261014.log`。新增纯内存和 schema 回归证明源码行为，不能替代修补后实际模型接受证据。
- 局限：只有 failed 请求证据，真实模型报告/写闭环、其他模型、UI可见性、费用/效率对照和远程 CI 均未验收。工作区/集成链路做了静态检查，未确认额外新 bug，不把现有边界重复列为缺陷。
- 下一步：按建议 0.6.1 继续做一次有界真实只读复验；正式缓存升级需单独授权。错误分类按官方结构化字段细化，真实写闭环、其他模型、UI 可见性和效率评测仍未做。
- 实际交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；本轮开始时暂存树 `5883ba02ce16b6e17f8078aee4e0bdb7664fa920` 保留，本轮源码、测试和文档改动未暂存，无跨 worktree 未同步内容，未 commit/push/发布。

## 0.6.0 三批工程升级完成（2026-10-14）

用户授权按方案升级，直接在主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`（main，HEAD `25e15c7`）完成 A/B/C，package/lock/两 manifest 统一 0.6.0。完整要求到证据映射见 [UPGRADE-0.6.0-RESULT.md](UPGRADE-0.6.0-RESULT.md)。下方“尚未实施”是本轮开工前历史。

- A：修复 evidence 后 deadline、双向文件/目录转换、compact/overview owner 一致性及 legacy review model/effort 约束。真实临时 Git/worktree 与完整 runtime 验证转换独立审查/队长复核/集成/源复验，用户 staging、HEAD/index 保持。
- B：可选 limitations、矛盾报告诊断，旧报告读取/旧 blocked 保持；skill/prompt 明确证据格式、验证职责及共享 STATUS 由队长维护，完成报告可带局限待复核，未放松写任务门禁。
- C：两个无新依赖模块 actions.js/observation.js，官方 lifecycle 的有限元数据、512 字节/项、100 项/64 KiB；敏感载荷省略、早到通知绑定 turn、迟到与截断保护。HMAC 连接内游标绑定项目/任务/attempt，旧 status/wait、CLI 和面板兼容；完整无变化回执实测 716 字节。
- 清理：受控 TERM 失败继续 KILL并保留错误，实际临时 child 的 PID 持久化和信号失败组合保持退出未知、拒绝同轮重派。独立 B/C 审查另发现早到超限空条目，队长补失败复现、最小修补与回归，不将候选初次通过当最终结果。
- 最终 `npm run test:coverage` 276/276，0 fail/cancelled/skipped，60767.42 ms，行 97.60%/分支 90.63%/函数 95.43%；最终定向86/86。日志 `/tmp/teams-upgrade-0.6.0-final-coverage.log`、`/tmp/teams-upgrade-final-targeted.log`。官方 SDK/受控协议和真实本机命令分别记录，不当作实际模型写效果。
- Team 两次限定只读审查 krill/gpt-6.1-sol/high，133.5 秒与215.3 秒，均经队长原标准逐条复核后 succeeded；后一份报告正确找出已修边界，不声称成员复验修补后源码。真实临时宿主 smoke 无推理通过，正式配置未动。
- 最终候选 `dist/marketplace-v0.6.0-reliability-efficiency-final-20261014/`，源码/skill逐字节一致；真实doctor只读线程、SDK八工具、新cursor/wait、716字节回执、panel listener退出均通过，回执 `/tmp/teams-upgrade-0.6.0-final-package.json`。当前正式缓存仍0.5.2，未自动安装。
- 交付与边界：主目录源码全部到位，原暂存树 `83436b9a88ed75da259384fc14d2c31b1fa991de` 保持，本轮改动未暂存；无跨worktree未同步，未commit/push/发布/升级依赖。真实同条件效率及30%目标、正式缓存重装、新真实writer/reviewer写任务和远程CI按方案单独处理，尚未执行；评测记录模板已补，不宣称普遍提效。同项目并行写仍后置。

## 可靠性与交付效率升级方案（2026-10-14，尚未实施）

用户要求先明确达到的效果、做法与升级方向。新增 [UPGRADE-RELIABILITY-EFFICIENCY-2026-10-14.md](UPGRADE-RELIABILITY-EFFICIENCY-2026-10-14.md)，根 UPGRADE-PLAN.md 增加最新入口，保留历史。

- 五项目标：四项正确性收口、成员证据可直接复核、blocker/limitation 语义一致、有界过程记录与精简等待回执，以及同等质量下的总交付提效。工程行为与真实模型收益分开验收，不将并行时间或缓存比例当成总交付加速。
- 三批独立交付：A 先修 A2/A4，再收口 A1/A3；B 明确验证职责、固定 finding 证据格式、增加可选 limitations 并检查报告一致性；C 采集有界官方工具/命令元数据，在既有 status/wait 增加可选游标与变化摘要。第一版保留现有 finding 格式和旧记录，独立审查、退出确认与写集成门禁保持。
- 效率目标和边界：无变化增量响应目标 ≤1 KiB；可比任务交付尾部中位数缩短至少 30%为待验证目标。后续真实单 Agent/原生子 Agent/插件对照需独立明确运行预算，当前未执行，不承诺普遍提速。TERM/未知 PID 组合先注入验证，同项目并行写后置。
- 本轮主 Agent 直接制定方案，无新成员、运行代码修改或模型评测；只改计划/状态文档并检查格式与入口。实际交付主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，保留暂存树 `83436b9a88ed75da259384fc14d2c31b1fa991de`，本轮文档未暂存。下一步实施批次 A，完成后按风险验证并记录版本/候选包，正式安装单独处理。

## 上一轮 Team 审查效率与可靠性复盘（2026-10-14）

用户要求详细分析上一轮主子任务，完整证据和建议见 [TEAM-RETROSPECTIVE-2026-10-14.md](TEAM-RETROSPECTIVE-2026-10-14.md)。直接复盘宿主主线程、两个已有任务记录及相关源码，本轮未启动新成员或模型对照长跑。

- 主任务宿主时长 780115 ms，约 13 分钟；派发前约 87.6 秒，成员并行窗口约 400.3 秒，成员全部结束到交付约 292.1 秒。成员结束到 captain pass 约 155.7 秒，随后到最终答复约 136.4 秒；不能把必要复核全部计作浪费，也不能把并行重叠当成单 Agent 加速比。
- 成员最先提出四项已确认问题中的三项，均由队长独立复现，说明并行探索有价值。工作区成员 criteria 全 true，却把只读验证局限和不能写 STATUS 列为 blockers；运行时如实标 blocked，但合同/终态语义有改进空间。succeeded 属于 captain-attested，不代表只读发现由机器自动证明。
- 两成员 host 累计 1,541,089 tokens，其中输入 1,520,513、缓存输入 1,336,192（输入子集）、输出 20,576；非缓存输入 184,321。缺少主任务同口径用量、价格及对照组，不能宣称费用节省或速度胜过单 Agent/原生子 Agent。
- 宿主可读主线程，但两个 ephemeral 成员线程均无可读匹配；插件当前未持久化完整通用命令事件。本轮核实最终结论及阶段/用量，没有声称完整重放子任务命令。真实写入、恢复、重试、取消等能力不由这次只读审查代验。
- 结论与下一步：保留合同/状态/验收门禁，优先缩小子任务并交付可直接核查的复现证据，区分 blocker 与 limitation，压缩重复上下文及观察回执；充分已有上下文时先主 Agent 审查，再按独立盲区定向派一个成员。同条件对照评测未执行，不将“真实并行、有价值”直接等同于“已证明总交付更快”。
- 本轮只改文档，实际目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`；保留复盘开始时已更新的暂存树 `83436b9a88ed75da259384fc14d2c31b1fa991de`，本轮新增内容未暂存。未改运行代码、重跑业务测试、commit/push 或更新正式缓存。

## 0.5.2 当前工作树审查（2026-10-14）

本轮用户要求分析 bug 与升级方向，依据 PRINCIPLES.md 审查主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`（main，HEAD `25e15c7`）的当前文件，包括已有暂存改动。完整触发条件、行号、复现与验收见 [PROJECT-AUDIT-2026-10-14.md](PROJECT-AUDIT-2026-10-14.md)。本轮仅补文档，业务源码未修改，以下问题尚未修复。

- 确认四项 P2，未确认 P0/P1：A1 单任务 MCP status 未应用 owner 缺失的耗时/指引修正；A2 同步证据检查超时后仍调用 reviewer 或进入 awaiting_review；A3 legacy qualified 配置可让 review 选择非 expert model/effort；A4 文件与目录双向转换使 dirty snapshot 准备、审计及 discard 清理失败。旧 F1/F2/F3 的已完成修复不重复算待办，A1 是遗漏的单任务入口。
- 队长本轮 `npm test` 247/247，通过，0 fail/cancelled/skipped，75164.52 ms，Node v24.21.0/macOS；日志 `/tmp/codex-teams-audit-20261014-tests.log`。独立复现：A1 官方 MCP SDK 双入口与固定时钟对照；A2 当前 runtime 配受控证据检查推进时钟；A3 内存 runtime 与合法 legacy config；A4 两个真实临时 Git/worktree 验证六个失败入口，源 HEAD/index 保持。命令均 exit 0，临时 fixture 已清理。
- Agent Teams MCP 两个只读成员均 krill/gpt-6.1-sol/high，队长本次显式派发。状态机报告耗时 400.3 秒，逐条核对原三条 acceptance 并独立复现后 review(pass)，终态 succeeded。工作区报告耗时 391.6 秒，因只读合同未完成真实 Git fixture，终态 blocked；保留该状态，由队长补真实复现确认 A4。没有把成员自述当验证或把审查通过当作代码修复。
- 实际已安装 0.5.2 MCP 本轮完成成员启动与 panel 返回；右侧打开请求由宿主返回 queued。旧章节关于旧缓存尚未生效的描述为历史状态。本轮未重装缓存、修改用户配置或做真实 writer/reviewer 写任务。
- 未解决边界：TERM 发送异常清理、未知 launch/PID 落盘失败组合仍是未验证加固建议；跨平台/远程 CI、真实模型写闭环与同条件效率对照未运行。下一步先小补丁修 A2/A4，再收口 A1/A3 和针对性回归，之后做进程故障注入及小规模效率评测，再决定并行写。
- 实际交付：本报告与本节直接写入主目录，无跨 worktree 未同步内容。既有暂存树 `a5d5e3560f24fb9f81acae29ec49c25340f9638b` 保持；本轮文档未暂存，未 commit/push、升级依赖或重装插件。

## 0.5.2 实时状态面板与等待反馈（2026-10-14）

用户指出插件成员启动后无法感知进度，只能干等。直接在主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`（main，HEAD `25e15c7`）补齐连接内实时观察，版本与两个 manifest/lock 同步为 0.5.2；保留此前 F1/F2/F3 修复及用户暂存现场。

- `teams_status(panel:true)` 返回本项目实时状态页 URL，按项目复用启动 Promise，首次打开无需 task owner 或状态数据库。新增一个 status-panel.js，使用 Node 内置 HTTP，只监听 127.0.0.1 随机端口/路径，仅 GET，核对 Host/Origin，无新依赖、无任务写入或调度。
- 页面每 2 秒读取真实状态，显示任务、model/effort、阶段、耗时、最近记录、下一步与证据，保留搜索/筛选/展开状态。断连或读取错误显示旧记录提示，不伪装成实时推进。原离线 HTML 导出保持无网络连接。
- team 约定首次启动后请求面板，在宿主支持时打开右侧浏览器面板，否则提供链接；不自动启动外部浏览器。前台 wait 显式 10 秒，每阶段变化及时转述，至少每 30 秒给一次观察。旧 schema 缺少 panel 时说明缓存待升级，继续聊天反馈。页面不能接入原生子 Agent UI，不提供模型思维流或后台队长唤醒。
- 定向 `node --test tests/status-panel.test.js tests/status.test.js tests/mcp-routing.test.js`：28/28，约 1.9 秒；最终 `npm test`：247/247，0 fail/cancelled/skipped，约 60.0 秒，Node v24.21.0/macOS。日志 `/tmp/codex-teams-live-panel-targeted-20261014.log`、`/tmp/codex-teams-live-panel-full-20261014.log`。
- 独立只读复核以官方 Client/InMemoryTransport 实测 12 个并发请求、双项目隔离、主动 close、客户端断连、启动期间关闭、HTTP 门禁与恶意文本转义，无可复现阻塞。队长复核实现并补真实 SDK 路由测试；没有将此审查当作真实模型写任务。
- 真实 Codex 内置浏览器验收：受控示例从执行/命令验证变为等待队长复核，快照时间自动更新，搜索/筛选/详情展开刷新后保留；关闭临时服务后明确标“连接中断或状态读取失败，当前为上次记录”。验收进程、监听、状态 fixture 和临时页面均已清理。截图在本聊天 visualization 目录的 `agent-teams-panel.jpg` 与 `agent-teams-panel-card.jpg`，受控数据明确标注。
- 本机候选包：`dist/marketplace-v0.5.2-live-status-20261014/`。以真实 model/list 的当前配置 krill/gpt-6.1-sol/high 准备通用包，未保存真人偏好；包内源码/skill 逐字节一致。包侧 doctor --check-thread 通过（真实模型目录及只读权限，无推理；检测已有插件不代表已更新正式缓存），日志 `/tmp/codex-teams-live-panel-doctor-20261014.log`。官方 SDK 连接最终包，八工具及 panel schema、页面 v0.5.2、无 owner、MCP 子进程退出与 HTTP listener 退出均通过。
- 交付与边界：全部源码直接在主目录，无跨 worktree 未同步内容；用户已有两份文档暂存版本未变，本轮修改未暂存。未 commit/push、安装或修改正式用户插件配置。聊天回执/自动打开仍依赖前台 skill 和宿主 UI 工具，当前旧缓存不会因源码修改生效；下一步需用户授权升级该候选包并重开会话，随后验收真实成员任务的进度。远程 CI、真实模型任务及质量/效率对照本轮未运行。

## 主目录快速修复 F1/F2/F3（2026-10-14）

根据当前已暂存的缺陷报告，直接在 `/Users/anshunli1/asl/code/github/codex-agent-teams`（main，HEAD `25e15c7`）完成三项最小修复，源码版本仍为 0.5.1，无新增依赖或接口变化。

- F1：执行让出事件循环后、准备工作区前检查取消与 deadline；同轮取消或等待期间超时不创建工作区、不调用成员，保留取消原因。准备结束后的原门禁保留。
- F2：owner 缺失或已退出时，执行中任务的历史 attempt 与顶层耗时统一依据真实 endedAt；缺失结束时间保持 null，已记录结束时间保持固定耗时，活 owner 正常计时。不写回状态。
- F3：PATH 未设置时预检使用 Node Unix spawn 的默认 `/usr/bin:/bin`；显式空 PATH 仍搜索 cwd。真实 runVerification 覆盖未设置、空值、相对项、相对/绝对 executable 与缺失程序，共七种组合，启动结果一致且退出均已确认。
- 验证：Node v24.21.0/macOS，定向 `node --test tests/attempt.test.js tests/status.test.js tests/preflight.test.js` 48/48，约 27.5 秒；最终 `npm test` 243/243，0 fail/cancelled/skipped，约 65.7 秒。日志分别为 `/tmp/codex-teams-quick-fix-targeted-20261014.log`、`/tmp/codex-teams-quick-fix-full-20261014.log`。均为离线回归、受控成员及真实本机命令，不是新一轮真实模型验证。
- 交付：保留用户已有两份文档的暂存版本；本轮源码、测试及文档补充均未暂存。无需跨 worktree 同步，没有提交、推送或更新正式插件缓存。
- 边界与下一步：同步 Git 准备开始后仍不能即时中断；TERM 清理加固建议本轮未处理，跨平台 CI、真实模型任务与效率对照未运行。下一步按独立授权升级缓存或开展同条件效率评测。

## 审查结论同步到主目录（2026-10-14）

用户要求先将审查结论同步到业务主目录，暂不再使用聊天 worktree 作为开发交付目录。本轮实际操作目录为 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7`；同步前工作树和暂存区均干净。后续修改默认直接在此主目录进行，除非用户重新指定。

- 新增 [BUG-REVIEW-2026-10-14.md](BUG-REVIEW-2026-10-14.md)，保留原 0.5.0 审查证据，并增加当前主目录 0.5.1 的适用性复核。保留本文件既有历史，不以旧 worktree 的 STATUS.md 覆盖。
- 当前主目录已支持队长显式派发、可选真人模型确认及逐任务 model/effort；旧报告中的能力差异已更新为主目录已解决事项。
- 在主目录重新运行三项精简复现，均仍可触发：F1 取消后准备调用数为 1，准备错误覆盖取消原因；F2 owner 缺失时历史耗时从 600000 增至 1200000 ms，顶层均 null；F3 PATH 缺失时预检拒绝 git，而真实 spawn 成功、exitCode=0。另验证当前 taskSchema 接受 model/effort。所有命令退出码 0。
- 本轮只同步结论文档及明确主目录约定，尚未修复三项 P2。没有重跑全量测试；原 worktree 的 234/234 不作为主目录的新全量结果。既有主目录 0.5.1 的 239/239 历史记录保留在下文。
- 下一步：直接在主目录最小修复 F1/F2/F3 并补针对性回归；随后做真实任务协调开销评测，再决定有限并行写。未暂存、提交、推送、重装插件或删除 worktree。

## 0.5.1 交付目录纠正（2026-10-14）

用户再次指出主目录看不到改动。核查发现上一轮 26 文件仅修改并暂存在聊天 cwd `/Users/anshunli1/.codex/worktrees/fc32/codex-agent-teams`，未同步到用户主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`。Git worktree 拥有各自文件与 index，不会自动同步。宿主 cwd 及 team skill 的默认目标解释了执行位置，但没有规则要求忽略用户主目录；本文件此前明确的主目录约定未落实，属于交付疏漏。

本次两个 checkout 的 HEAD 都为 `d0bb4698b70f02c2343b5be62cfb679c18f31ee6`，同步前主目录工作树与 index 干净。将已验证的 0.5.1 改动及本次说明通过 Git patch 同步并暂存到主目录；AGENTS.md 新增开工核对执行/交付目录、保护用户内容、最终报告实际目录的规则。只同步源码及文档，不复制 ignored 环境/状态或插件缓存，不 commit、不 push。运行代码未再修改，沿用上一轮 239/239 和两组真实宿主证据；本轮验证 patch、暂存格式与两个目录交付文件逐字节一致。

日期：2026-10-13（Asia/Shanghai）。源码版本：0.5.1。**本轮修复模型确认启动阻塞和逐任务模型/强度缺口；正式用户缓存仍为 0.5.0，待显式升级。同项目并行写、桌面自然语言使用和真实模型质量/效率尚未验收。**

## 0.5.1 启动阻塞修复与仅暂存交付（2026-10-13）

用户授权发现问题则修复、完成后暂存，不提交远程。本轮由主 Agent 直接实施与复核；已安装 0.5.0 的 team 入口仍受旧模型确认约束，没有启动付费成员或声称完成独立模型审查。

- `teams_start` 增加显式 `models`（expert 与可选 simple），CLI start/run 增加 `--models <JSON>`。每次公开启动先发现实时模型目录，runtime 在记录 attempt 前检查角色和最终 model/effort；无效组合不调用成员推理，无偏好也无显式选择时仍返回操作指引。显式选择写入 `attempt.dispatch`（captain-explicit、分工、目标与校验时间），不改全局 profiles、不保存成真人偏好；并发只读成员可分别选择。
- 合同增加可选 model/effort，effort 必须配 model。成员可显式覆盖，review 必须匹配 expert；重试清除覆盖并使用本轮 expert，写任务独立 reviewerSelection 固定在 attempt。旧真人偏好不会在创建合同阶段提前拒绝新派发分工，启动时统一路由校验。CLI 真人提交后使用刷新后的目录继续校验。
- 真人表单继续可选保存/撤销本项目偏好。通过 peekRuntime 检查既有执行，不为等待/取消/拒绝新建 owner；明确有效 accept 后才获取 runtime。已存在的运行时及 owner 不随拒绝被关闭。旧式直接 SDK 工厂缓存已创建的 runtime，避免检查既有执行时另建 owner。独占写、退出确认、命令验证、独立 expert 审查、队长复核及集成复验门禁保持。
- 版本与 lockfile/两 manifest 统一 0.5.1；principles 明确并行为减少总耗时的手段，skill 增加需求评估/人数选择及显式派发流程。README、路线、架构、示例、升级计划和简报同步新行为，旧诊断保留为历史。同项目多写者和源工作区共存机制仍未改造，不声称效率收益。

验证过程：首轮定向 73/74，新增无表单测试误注册表单 handler，被 SDK 在执行前拒绝；修正 fixture。首轮覆盖率 237/238，既有 doctor 子进程在并行封装压力下触发 5 秒上限；该文件单独复跑通过，未改超时或断言。此后串行进行最终完整回归和宿主验证，以最终记录为准。真实宿主 smoke 使用临时安装与临时 CODEX_HOME、回复 cancel 或观察自动 decline；没有真人接受、真实模型推理、正式配置写入或缓存替换。

**最终验证与交付：**

- `npm run test:coverage`：239/239 通过，0 fail/cancelled/skipped，58.95 秒；源码行 97.35%、分支 89.59%、函数 96.17%。覆盖显式派发/任务覆盖/无效目录拒绝、重试 expert、并发选择隔离、旧偏好保留、CLI 无 TTY，以及两条 MCP 写任务完整命令/独立 reviewer/队长复核/集成复验路径。模型使用受控协议 fixture，不是实际模型质量验证。日志 `/tmp/codex-teams-0.5.1-final-coverage.log`。
- 最终源码分别运行 `node scripts/smoke-plugin.js --approval-policy never` 和 `--approval-policy on-request`，退出码均 0；真实 Codex Desktop 0.162.0-alpha.17.2 临时缓存观察版本 0.5.1、八工具和新增 schema 正常，同一连接/安装双项目继续通过。never 自动 decline 未转发表单、on-request 转发表单并由测试 cancel；两者都不新建 owner，未知模型拒绝启动。均 `inferenceStarted:false`、`userConfigChanged:false`、`managedRuntimeExited:true`。日志 `/tmp/codex-teams-0.5.1-final-host-never.log`、`/tmp/codex-teams-0.5.1-final-host-on-request.log`。临时缓存和 fixture 在退出确认后清理。
- 主 Agent 复核最终 diff，`git diff --check` 通过；交付只暂存本 worktree 的源码/测试/文档与版本文件，不 commit、不 push，不修改正式缓存或用户模型偏好。没有独立真实模型审查结果，不以协议 fixture 冒充。

下一步：显式构建/更新用户缓存到 0.5.1，重开会话使工具 schema/skill 生效，再用真实任务验证模型质量及协调开销；源码暂存不会修改当前运行的 0.5.0 MCP。并行写仍按升级计划分阶段另行验证，不删旧 dist、不自动集成冲突，不自动发布。

## 模型确认启动阻塞诊断（2026-10-13）

用户要求沿本项目源码调查团队成员为何被模型确认挡住。本轮仅诊断及记录，未修改运行代码、用户配置或模型授权，未启动成员推理。

- 当前聊天的 `teams_models(workspace)` 返回 `selection:null`、`confirmationRequired:true`；`confirm:true` 返回 `status:decline`，并非可据以认定的用户主动拒绝。`teams_status` 证实正式缓存与 runtime 已是 0.5.0，任务为 0、owner 进程存在；此前头部“正式缓存尚未升级”已被本次实时观察更新。
- 源码路径：`src/mcp.js` 的 `selectionFor` 只复用本项目有效的会话或持久确认；确认通过 `ctx.mcpReq.elicitInput` 请求宿主，非 accept 不保存分工；`teams_start` 在无有效确认时拒绝启动。`src/workspace-router.js` 创建公开 runtime 时固定开启 `requireModelConfirmation:true`，`src/runtime.js` 再次检查。读取到 configuredModel/configuredEffort 不构成确认，也没有自动退回配置的公开启动路径。
- 独立真实宿主对比：以当前源码、官方 SDK 和同版本 Codex Desktop 0.162.0-alpha.17.2，在两个独立临时 CODEX_HOME/安装缓存中执行无推理 smoke。外层 `approvalPolicy=never`：表单请求未转发、返回 decline；外层 `on-request`：表单请求转发成功，测试主动回复 cancel。两种策略均正确阻止未确认启动，退出码均 0，`inferenceStarted:false`、`userConfigChanged:false`、`managedRuntimeExited:true`。日志 `/tmp/codex-teams-confirmation-never.log`、`/tmp/codex-teams-confirmation-on-request.log`。当前聊天本身的有效 approvalPolicy 未由本工具协议暴露，因此其 decline 与 never 实测相符，但不能仅凭 decline 排除其他宿主拒绝原因。on-request 的协议转发不等于桌面表单已渲染。
- 恢复障碍：确认入口在请求表单前调用 `scope.getRuntime()`，取得唯一 owner；decline 不关闭 runtime。因此新项目即使没有任务也可能持锁，CLI 不能与当前 MCP 同时完成确认。现有回归明确覆盖该行为，属于现行设计，不是状态库锁泄漏的证明。
- 与 `docs/UPGRADE-BRIEF.md` 的差距仍在：可省略的模型选择依旧是必经门槛。建议将“队长显式指定并经 live catalog 校验的模型/强度”与“可选的真人偏好确认”分开设计；保留不静默降级、expert 独立审查/重试及 attempt 证据。不要把宿主 decline 当作授权，不以直接写 SQLite 或关闭安全门禁绕过。

当前 worktree 初次 smoke 因缺少 zod 在加载阶段失败，未进入宿主检查；随后 `npm ci --ignore-scripts` 安装锁定依赖（14 packages，0 vulnerabilities），两组真实宿主对比才通过。临时安装缓存和 fixture 在退出确认后清理。`node --test tests/models.test.js tests/mcp.test.js`：32/32 通过，0 fail/cancelled/skipped，34.19 秒，日志 `/tmp/codex-teams-confirmation-unit.log`；包含未确认拒绝、表单能力、取消不授权、偏好复用及 owner 冲突回归。完整原始升级预期审查仍待继续。

下一步：若实施可选模型确认，须同步 PRINCIPLES、skill、MCP/CLI 合同与测试，再构建并显式更新缓存；只改当前源码不会改变已运行的 0.5.0 MCP。临时宿主对比已定位策略影响，无需付费长跑或重复发起同一表单。

## 主目录同步（2026-10-13）

前两轮修改发生在 Codex worktree `/Users/anshunli1/.codex/worktrees/83cf/codex-agent-teams`，未自动回写用户主目录。用户指出后，将 0.4.1 修复与 0.5.0 跨项目优化同步到 `/Users/anshunli1/asl/code/github/codex-agent-teams`。两个 checkout 的 HEAD 均为 `646f8f6`；主目录已有暂存的 `UPGRADE-PLAN.md` 和 `docs/UPGRADE-BRIEF.md`，保留原内容和 Git 暂存状态，仅在主目录计划工作副本补入当前交付记录。

`docs/UPGRADE-BRIEF.md` 并非项目缺失，而是当时未随 worktree 带入的主目录暂存文件。已补读：简报提出的同项目并行写、逐任务 model/effort 覆盖、可选用户模型确认和真实协调耗时评测，**没有由 0.5.0 跨项目路由实现**，继续作为待办，不把本次目录同步视为这些目标完成。后续用户主目录工作使用上述实际路径。

同步后直接在主目录运行 `npm test`：234/234 通过，0 fail/cancelled/skipped，52.44 秒；`git diff --check` 通过，package 版本为 0.5.0。35 份同步文件在复制后逐字节核对一致；主目录已有两份文档的暂存 blob 保持不变，升级简报工作文件也逐字节保持原样。验证日志为 `/tmp/codex-teams-main-sync-tests.log`。未提交、推送、构建产物或修改正式插件安装。

## 0.5.0 安装一次，全项目通用（2026-10-13）

用户指出固定 workspace 与“所有 Codex 项目通用”冲突，并明确授权优化。本轮延续 0.4.1 未提交改动，新增一层小型项目路由；没有新依赖、中央任务索引、跨项目依赖或共享 owner。三条车道分别负责 MCP、路由、技能示例，主 Agent 负责配置/CLI/打包/build、文档、复核与统一验证。

**使用行为：** 在项目聊天中要求“用 Team 处理这个任务”，队长从当前聊天目录或已授权目标自动传入项目路径，用户无需手填已知目录。新插件包删除 workspace，安装一次后换项目不改配置、不重新打包。项目目标来自明确的工具参数，不声称宿主自动传 cwd；首次模型发现、列表与重连恢复由队长传 workspace，创建合同继续要求 expectedWorkspace。后续已知 taskId 在同连接已知项目中自动定位，多项目列表不猜最近目录。

**实现与门禁：**

- config.workspace 改为可选。CLI 无固定配置时用实际 cwd 或 --workspace；MCP 保留插件缓存启动目录但从不将其兜底为项目。build 新配置不保存 workspace，pack/build 从解析副本删除旧 workspace 后生成通用包，原本机文件保持不变，旧项目路径失效也不阻止全局打包。旧含 workspace 的直接 CLI/MCP 配置继续固定目标并拒绝覆盖。
- `workspace-router.js` 按真实目录身份复用稳定 scope，分别提供模型发现、只读观察和延迟获取运行时；各项目保留原 `.codex-teams/state.sqlite`、worktree、偏好和唯一 owner。每次调用与异步发现返回后重验身份；符号链接别名不产生第二 owner。观察和发现不恢复旧任务、不创建状态或 owner。
- MCP 每次请求捕获自己的局部 scope，七个工具增加可选绝对 workspace，create 的 expectedWorkspace 保持必填。确认进行中和会话选择按项目分别记录；项目 A 的授权/撤销/取消不会作用于 B，保存偏好仍需本项目真人明确提交。跨项目依赖被原项目 store 拒绝，任务执行/命令/独立审查/集成门禁保持。
- taskId 仅查此连接已知项目的只读快照，不扫描任意目录。错误 workspace 拒绝；重复 ID 在未指定项目时拒绝歧义，明确 workspace + taskId 可定位各自记录。目录被替换时拒绝省略路径的自动查询，显式正确项目仍可操作未受影响的任务。
- 关闭先阻止新路由，再等待所有已创建项目运行时退出并聚合错误；单个关闭失败不跳过其他项目。每个项目保留原并发限额与带计划任务独占规则，没有全局后台调度。
- 技能、示例、README、原则和路线同步 0.5.0 用法，修正技能 MCP 必填字段说明；打包 Node/Codex 与 POSIX shim 沿用 0.4.1 真实宿主验证的规则。生成 README 的路径使用安全 shell 引用。

**独立复核与修正：** 打包车道发现旧公开 `createMcpServer` 无 route 时会静默忽略新 workspace 参数，从而错误取消/撤销原项目。现旧直接构造 API 在获取 runtime 前明确拒绝显式 workspace；CLI 总通过 router，无此退路。另统一重复 ID 的消歧合同，避免测试与显式项目优先语义冲突。合同车道复核配置/CLI/打包/技能，确认车道复核路由与关闭，打包车道复核 MCP 与双项目写入验收；自述均待最终验证，未独立重复跑全量。

**最终验证：**

- `npm run test:coverage`：234 tests、234 pass、0 fail/cancelled/skipped，55.50 秒；源码行覆盖 97.34%、分支 89.46%、函数 96.11%，新路由模块行/分支/函数均 100%。这不替代身份、owner 与错误项目的语义验收。
- 官方 SDK 的单连接双项目回归覆盖只读无 owner、模型/task/review/forget 隔离、并行表单与同项目异步竞态、重连偏好恢复、重复 ID 消歧、legacy 参数拒绝，以及真实 stdio 断连释放两个 owner。
- 新双项目写入纵向回归使用真实 CLI stdio、两个真实 Git 仓库与用户 staged/unstaged 内容；并行受控 writer、独立 expert reviewer、真实 Node 测试、队长复核、错误项目集成拒绝、按任务 ID 逐项集成和源复验均通过。HEAD、原 index 与用户文件保持，另一项目不受先行集成影响。**模型均为受控协议 fixture，不是实际模型推理。**
- `node scripts/smoke-plugin.js`：真实 Codex Desktop `0.162.0-alpha.17.2`，同一个临时 CODEX_HOME 安装缓存和同一个 MCP 连接操作两个项目成功，八工具与 skill 正常。包内不含 workspace，先删除 marketplace 源插件目录后缓存仍工作；模型目录/表单取消门禁/文本转发保持；两项目创建/查询/取消、错误目标拒绝、多目标歧义拒绝与 cache cwd 拒绝均通过，两项目运行时正常退出。`inferenceStarted:false`、`userConfigChanged:false`、`managedRuntimeExited:true`。
- `git diff --check` 通过。最终日志：`/tmp/codex-teams-83cf-global-tests.log`、`/tmp/codex-teams-83cf-global-smoke.log`。临时测试与安装工作区在 owner 退出确认后清理；未更改正式 Codex 配置、删除旧 dist 或调用付费模型。

**边界与下一步：** 正式缓存仍是已安装旧版，需要用户一次构建/显式更新到 0.5.0，之后不为换项目重打包。首次新项目仍需要该项目的真人模型确认，记住后本项目复用，不跨项目自动授权。MCP 不具有可信的当前聊天 cwd 自动注入；技能从已知聊天上下文传参，多个目标或项目无上下文时需要明确实际目标。新接口与双项目流程已通过 SDK/宿主协议，桌面自然语言使用与实际 UI 渲染、真实模型效果、远程平台矩阵未验收。既有 integration_failed 取消语义、孤儿进程边界保持。下一步在正式 0.5.0 新聊天验证“用 Team 处理”能自动传当前项目，之后再做真实模型质量/效率对照。

## 0.4.1 委派、确认、前台进度与打包收口（2026-10-13）

用户要求参考 `docs/UPGRADE-BRIEF.md` 和 `UPGRADE-PLAN.md` 修复一版，并授权子任务并行。前者在本 checkout 中不存在，本轮依据升级计划与最新原则、路线、状态工作。并行三条实现车道（合同、确认、打包），主 Agent 负责 CLI、统一复核、交叉独立审查及最终验证；子任务自述不作为通过证据。

**完成内容：**

- P2-C 收口：`executionPlan` 误填字段给出 `allowedPaths` 与 `preflight.requiredFiles` 的迁移提示，未知字段继续拒绝；示例增加可直接填写实际目标后调用的 MCP 合同模板。`complexity=uncertain` 保持，只有显式 simple 路由轻量；旧计划中的 bounded 默认值与 required 裁剪均已证伪，不实施。
- 真人确认的“记住此工作区分工”默认勾选，可关闭和撤销；`remember` 为表单必填布尔字段，漏传或非法值拒绝且不改旧分工。终端回车默认记住、no 仅本次、最后 yes 才确认；取消不保存。每次启动仍重新校验目标、模型、强度、策略版本。
- 官方 SDK 能力矩阵覆盖无声明、旧式 `elicitation: {}`、form、URL-only；前两种不等价，旧式空声明允许表单。缺表单能力/取消的 CLI 指引包含同配置、真实 stdin/stderr TTY 和先释放 workspace owner 的条件。
- 新 `cli-progress.js` 只观察前台任务：阶段变化及每 30 秒回执写到 stderr，stdout 保持最终 JSON。最近记录不是心跳；等待快照不取消成员，运行时仍拥有截止时间与退出门禁。没有常驻进程、定时后台调度或新依赖。
- 修复 CLI 信号关闭竞态：SIGINT/SIGTERM 先停止输入或取消执行、等待退出并读取输出终态，finally 才关数据库。readline 所有问题接外部取消信号，另监听 close 中止 EOF；保留 Node 默认 Ctrl+C 行为，不销毁真实 stdin。覆盖四个提示中止、EOF、Ctrl+C、实际 CLI 成员/输入期间 SIGTERM。
- P3 可安全实施部分：版本元数据统一 0.4.1；两个 manifest 的共有字段一致且各自遵守官方格式；打包解析并检查 Codex 绝对可执行身份，不快照构建 PATH，启动继承宿主实时 PATH 并补 Node 目录。现代入口使用插件内 POSIX shim `./mcp-launch` 调用固定 Node，兼容入口直接调用固定 Node，两者共用 JS launcher。Node 路径含空格/单引号、缓存移动、宿主 PATH 无 Node 但有自定义验证工具均实测。Windows 在构建/打包入口提前拒绝。

**验证中发现并修正：**

- 此新 worktree 初次测试缺依赖而未进入业务用例；随后 `npm ci --ignore-scripts` 安装锁定依赖，14 packages、审计 0 vulnerabilities，无新增依赖。
- 旧交互 fixture 匹配旧记住提示，导致等待并暴露 SIGTERM 未取消 readline；已更新 fixture 并修真实输入取消。写任务 MCP fixture 漏传新增必填 remember，被真实 SDK 拒绝，已补显式 false。独立复核进一步实测 EOF pending 并修复。中间失败/中断测试不作为最终验收。
- 真实宿主最初拒绝现代 MCP 的绝对 command，提示 `Agent Plugins stdio command must be a bare executable name or a contained ./ path`，库存为空并最终启动超时；普通 SDK 不验证该宿主限制。补诊断后定位并改为插件内 shim，重新跑实际临时缓存 smoke 通过。这条修法依据本机实际 loader，官方实现见 [agent_plugin_config.rs](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs)。

**最终证据：**

- Node v24.21.0，`npm run test:coverage`：214 tests、214 pass、0 fail/cancelled/skipped；源码行覆盖 97.27%、分支 88.32%、函数 95.48%。真实 Git、验证命令及进程退出路径均包含；成员模型使用受控协议 fixture，不能视为真实模型验收。
- `node --test tests/plugin.test.js tests/build.test.js`：14/14；终端定向回归 9/9。主 Agent 复核所有车道 diff，合同车道独立复核 CLI，确认车道独立复核打包，打包车道独立复核确认；发现的关闭竞态、EOF、现代 command 约束均完成修复后再验证。
- `node scripts/smoke-plugin.js`：真实 Codex Desktop `0.162.0-alpha.17.2`，临时 CODEX_HOME 中安装与缓存启动 ready。移除源码 marketplace 插件目录后缓存仍独立工作；skill 与八个工具发现成功，viewer/runtime 均 0.4.1，模型目录读取、表单 remember default/required、取消阻止启动、合同校验、owner 释放均通过。第二块人类文本通过宿主协议转发，**不等于桌面 UI 已渲染**。未启动 turn 推理，`inferenceStarted:false`、`userConfigChanged:false`、`managedRuntimeExited:true`。
- `git diff --check` 通过。覆盖率及宿主证据保存在本机临时日志 `/tmp/codex-teams-83cf-final-tests.log`、`/tmp/codex-teams-83cf-final-smoke.log`；临时安装与测试工作区在退出确认后清理。

**未解决边界与下一步：** 正式用户缓存未重装，未发布/提交/推送，未运行真实模型推理或远程 CI。未读取或删除旧 dist 副本；`integrate()` 取消仍按既有 recovery-required 语义记录 integration_failed 并保留已应用改动，本轮不改产品语义。events/features/qualified 的兼容清理与更激进哈希缓存不在本轮范围。下一步可由用户构建并显式重装 0.4.1 正式缓存，验收桌面表单与第二块回执的实际渲染；真实模型质量/效率需另做同条件交付评测。

## 0.4.0 状态一致性修复（2026-10-13）

用户与主 Agent 各自独立审查同一版本，**四条缺陷结论逐条吻合**（行号与机制一致）。四条均可复现，且**没有一条由现有测试捕获**——`attempt.test.js:192` 当时正在断言其中一句错话，97.18% 行覆盖率与之共存。这是本轮最重要的记录：覆盖率不能作为此类缺陷的发布依据。

四条缺陷与修法：

- **主动取消被误记为超时**（`runtime.js`）。队长取消后清理跨过截止时间，deadline 定时器仍把已 abort 的 controller 当成自己的，记录成 `status=timed_out` + `task_deadline_exceeded`，而 `error` 仍是 "Cancelled by captain"——同一事件两处记录互相矛盾。修法：deadline 处理器先判断 `controller.signal.aborted`，已经有人 abort 过就不接管；取消路径不再写 `failure`（"哪个阶段失败"对主动取消无意义）。
- **退出未确认却提示"无残留进程"**（`status.js` / `runtime.js`）。超时文案断言 "未检测到需确认的残留进程"，而同一次记录的 `cleanupConfirmed:false`、进程组存活、重试被退出门禁拒绝——指引自相矛盾。（原审查结论为"整理措辞"；主 Agent 复现后确认是**在不该下断言处下了断言**。）修法：运行时文案删除该断言，改为"重试前确认成员进程已退出"；显示层新增 `memberExitConfirmed`，从记录事实读取。
- **重试历史漏显示旧验证结果**（`status.js`）。所有 attempt 都用最新 attempt 的工作区查验证记录，导致早期 attempt 已 `passed` 的检查显示为 `null`。修法：按 attempt 各自的 `workspaceId` 解析。
- **具体修复指引被通用文案覆盖**（`status.js`）。**由本批引入的回归**：为修取消路径显示成员错误，将优先级改为终态优先，副作用是把已识别的具体指引（如 `verification_executable_missing → 安装缺失的验证程序`）替换为 "检查错误与退出记录"。修法：回到具体优先，并在源头修取消路径。

**对抗验证（两个独立车道，均以可复现证据为准）**：

- 车道一删除修复代码后重跑同一场景，确认修复**真实生效**（未加守卫复现 `timed_out`，加守卫得 `cancelled`）；并确认 Node 24 上二次 `abort()` 不覆盖首个 reason，这是该修复成立的前提。
- 车道二指出主 Agent 新增的 `memberExitConfirmed` 对**运行中** attempt 报 `true`——`cleanupConfirmed` 在终态前根本不存在（`undefined !== false` 为真），等于为活着的进程断言"已确认退出"。已改为 `?? null` 并补回归。
- 车道二另指出：上一批取消路径曾写入 `failure`，**已在磁盘上的历史记录不会被迁移**，恢复具体优先会让这些旧记录重新显示误导指引。已在读取处一并兜住并补回归。

**证伪记录**：原审查建议"删掉那句文案"即可。实测确认运行时写该句时清理确实未确认，问题不是措辞而是断言位置。另有原升级计划中"改 `complexity` 默认值让轻量模型生效"的设想，实测 `auto + bounded` 仍走 EXPERT，仅显式 `simple` 生效——该设想不成立，已从计划移除。

**已确证但未处理（记录备查，非本批范围）**：

- `integrate()` 有独立的 deadline 定时器，无同类守卫，队长在集成期间取消会被记为 `integration_failed`，与"集成超时"不可区分。该行为自 0.2.0 起被 `tests/write.test.js:263` 断言，改动需先决定产品语义。
- `shutdown()` 与 `cancelVerification()` 复用任务 controller，会使任务被记为 `cancelled`。经查 `cancelVerification` 无 MCP/CLI 暴露面，当前不可达。

**验证**：`npm test` 182/182，0 fail/cancelled/skipped；`git diff --check` 通过。本轮新增 2 个回归（取消跨截止时间、退出确认与历史取消记录），并更新 2 个原先锁定错误行为的断言。**未运行真实模型推理、未跑远程 CI、未重新构建插件包、未重装宿主缓存。** 上述均为受控协议与本机命令复现，不代表真实宿主已发生同类组合故障。

**已知漂移**：`docs/STATUS.md` 此前头部仍写 0.3.0（已随本条修正）；`dist/` 存在 9 份副本（约 144MB）及一个无对应源码的 `marketplace-ui-v0.4.1-*` 目录，`scripts/clean-dist.js` 默认空跑，删除需用户显式授权。

**下一步**：先在允许交互的真实宿主完成无推理验收（重点看 `teams_status` 的第二块人类可读回执是否真的被渲染——离线测试只能证明字符串生成，不能证明宿主显示）；通过后再决定 `integrate()` 语义与 worktree 绑定报错的可操作性改进。

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
