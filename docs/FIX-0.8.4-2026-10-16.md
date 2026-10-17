# 0.8.4 修复与验收（2026-10-16，源码及候选，未发布）

本文件保留前轮交付记录；覆盖率隔离和完整最低版本验收已在 [2026-10-17 补修](COVERAGE-FIX-0.8.4-2026-10-17.md)中更新。

交付目录：`/Users/anshunli/单纯回话/codex-agent-teams`。基线 HEAD：`6d263a8670c32e24005a2f893087324531ca91cf`。用户授权按[0.8.3 后续升级评估](UPGRADE-ASSESSMENT-0.8.3-2026-10-16.md)修复升级，并指定原生 team 技能。

两次原生子 Agent 启动都在执行前因宿主继承模型的路由 404 失败；已关闭，没有成员代码或独立审查通过回执。主线接手实现、复核和验收，没有模型降级、另起调度器或将启动失败当成成员完成。

## 修复结果

| 事项 | 最终行为 |
| --- | --- |
| 更新并发 P1 | `scripts/update-lock.js` 在有效 Codex home 建立排他锁，覆盖读旧状态、修改、验收和恢复。同一 home 的另一个更新进程在读取安装状态前拒绝；规范化 home 的别名共用同一锁。释放前核对 inode 和 owner token，保留被替换的锁。 |
| 回滚所有权 | `scripts/update.js` 在回滚前复核锁、marketplace、插件元数据和已观察的缓存内容。非配合 CLI 的外部更新改变状态时保留现场及恢复副本，不删除外部成功安装。默认 CLI 适配器明确使用传入的 Codex home。 |
| 可验证恢复副本 | 删除旧缓存前复制旧缓存并核对关键文件身份，生成临时恢复 marketplace。回滚从副本安装，避免旧来源在删除后漂移而丢失原字节；恢复前再次核对副本，损坏副本不回装。成功更新清理本次副本，回滚使用的副本保留并报告路径。 |
| 安装边界语义 | 无 npm 依赖的 `validatePreparedPlugin` 共用于 native 打包和安装；模式显式限制 native/strict，检查 SemVer 与 manifest/package/build-info 版本一致，native 检查目录、资源字段及按实际内容重算 sourceDigest。预检、安装前和安装后核对候选/缓存身份，并核对官方列表版本。 |
| 中文路径测试 | `tests/config.test.js` 使用 `fileURLToPath`；新增复制源码到中文/空格目录、启动真实 CLI 并核对只读 status 的回归。 |
| macOS 测试清理 | 崩溃恢复测试复用生产 `signalGroup` 回退；独立 cleanup hook 保留原断言错误，正常流程仍在确认组退出后检查恢复结果。 |
| CI 分离验收 | 四个功能 job 覆盖 Ubuntu/macOS、Node 24.0.0/24.x。两个平台的 Node 24.x 独立运行覆盖率，失败保持失败并打印 V8 JSON 诊断。**最低版本历史 coverage JSON 异常的根因未修复、未宣称已修复**；功能最低版本兼容性继续完整验收。 |
| 版本与说明 | package、lock 根元数据及两份 manifest 同步 0.8.4；README 说明更新锁、恢复副本、CI 范围和清理边界。默认 skill 内容保持精简，没有新增依赖。 |

## 验证证据

[结构化结果](evidence/fix-0.8.4-2026-10-16/results.json)包含执行结果和日志位置。复制到仓库的终端日志只移除了行尾空白，原日志路径及 SHA256 保留，既有暂存证据未改。

- 修前反例：更新事务 3/3 失败，候选语义 5/5 失败；配置测试 2 项中 1 失败。修后对应反例通过，新增例确实能检出旧实现问题。
- 中间定向：更新、native、CLI、配置和 attempt 共 **136/136** 通过。该结果早于最后三个恢复/适配器例，最终以全量计数为准，不累加成功率。
- 最终 Node **v24.21.0**：`npm run test:coverage` **428/428**，0 fail/cancelled/skipped，177956.587ms。`src/*.js` 行覆盖率 **97.40%**、分支 **89.92%**、函数 **95.06%**。覆盖率范围没有包含 scripts，更新器/锁另有直接回归和官方 CLI 检查。
- 最终 Node **v24.0.0**：`node --test --test-concurrency=4 tests/*.test.js` **428/428**，0 fail/cancelled/skipped，186171.612ms。运行时来自临时目录，官方归档 SHA256 核对通过，没有改全局 Node 安装。
- CI coverage 环境定向：`NODE_V8_COVERAGE` 下的 native、lock、attempt **39/39** 通过；41 个原始 V8 JSON 均可解析。不是最低版本 coverage 或远程矩阵验收。
- 真实官方 CLI **0.163.0-alpha.10.2**，macOS arm64，临时 home 的 **7 项**检查通过：三个损坏候选预检零修改；第二更新进程被拒绝；外部 CLI 的 99.0.1 安装保留；旧来源晚期漂移后原 0.8.3 字节恢复；压缩包解压安装与构建文件逐字节一致。脚本可在[官方回归入口](evidence/fix-0.8.4-2026-10-16/official-update-regressions.mjs)复跑。
- native/strict 两个现有真实宿主 smoke 均通过、临时 App Server/托管运行时退出，无推理；native 缓存仅 4 文件、4211 字节，移除来源后 skill 可发现，零插件 MCP/hooks；strict 的工具、双项目隔离和表单/取消路径检查通过，未声称真实 hook 执行或模型路由已验收。

## 候选交付

已通过正式 build 入口准备 native 包，压缩、解压、官方 CLI 安装并逐文件比较。源码更新不代表正式安装更新。

```text
dist/releases/0.8.4/codex-agent-teams-native-0.8.4.tar.gz
dist/releases/0.8.4/codex-agent-teams-native-0.8.4.tar.gz.sha256
SHA256: fce27a52a07a7a8543bc9bebad91841dbd92440e02b96f0554e8ea47ea0fd4b5
```

该 dist 目录受 gitignore 管理；当前候选是本地交付资产，尚未发布。源码和本轮文档/证据未暂存，开工既有 35 个暂存证据及 HEAD 保持，未 commit/push/tag/正式 update；没有跨 worktree 未同步内容。

## 保留边界与下一步

- 更新进程异常退出留下的锁不会自动接管：父 PID 消失不能证明 CLI 子进程已退出，需核对后人工清理。这是保守拒绝，不是自动崩溃恢复功能。
- 回滚安装回执可能引用独立恢复 marketplace 的内容路径，因此副本保留；后续成功更新并确认缓存来源后可人工清理。备份损坏时明确失败并保留现场。
- 锁约束配合本项目的更新器；对不持锁的外部 CLI，检查到状态变化时停止回滚。仍不承诺阻止任意同权限进程在每个检查与文件操作之间修改内容。
- strict 运行依赖未逐文件哈希；保存并核对关键文件不等于依赖完整性认证。
- 本轮未 push，也未运行 GitHub runner。配置为四个功能 job 加两个覆盖率 job；两种 Node 的本机通过不能替代 Ubuntu/macOS 的远程矩阵。
- 真实桌面停止、实际模型/effort/token/费用和可比效率试验未新增验收。公开许可、正式提交/发布/安装继续独立处理。

收尾核对：正式 0.8.3 插件缓存逐文件哈希与先前 readiness 相同。正式 config 与较早 readiness 的哈希不同，该旧记录不是本轮起点，不能归因于本轮；未覆盖或回退该配置。官方更新探针单独核对其前后 config 哈希相同，所有安装及宿主检查都使用临时 home。
