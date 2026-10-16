# 0.8.3 修复与交付（2026-10-16）

用户授权在 `/Users/anshunli1/asl/code/github/codex-agent-teams` 修复升级。当前源码和原生候选均为 **0.8.3**，正式安装未更新。本轮依据 [0.8.2补充评估](NATIVE-TEAM-AUDIT-0.8.2-2026-10-16.md)，修复目录清单验收缺口、增强真实不同内容的更新回归，并明确宿主派发参数关闭父历史继承；没有新增依赖或协作运行时。

队长负责更新校验、版本、skill、文档、全量回归和官方CLI/宿主验证；复用原high成员独立修改更新测试，成员只写 `tests/update.test.js`，队长复核实际改动与证据。成员的原请求为 `group/auto-gpt-6-astra / high`，本轮复用没有切换设置，底层实际模型与强度仍无回执。

**实现**

- `scripts/update.js` 的 native 身份检查增加固定目录清单。只允许 `.codex-plugin/plugin.json`、`package.json`、`build-info.json`、`skills/team/SKILL.md` 四个普通文件及其父目录；额外 skill、根运行时文件、helper、空目录、链接和不符的路径类型均拒绝。枚举范围仅为这四层已知目录，父路径先检查类型，不遍历未列名入口。复用既有身份检查，覆盖候选、旧缓存、恢复来源、安装结果与恢复结果。原有src/node_modules拒绝、旧来源保护、legacy迁移和strict关键文件检查保持。
- `tests/update.test.js` 的默认旧来源具有不同版本、skill和摘要；缓存采用实际home/version路径。模拟remove真实删除，add从选定marketplace真实复制，恢复hook读取旧来源。新增不同版本、同版本不同内容、旧元数据配新字节的假恢复，以及strict→native成功/失败恢复；六类异常分别验证候选/旧缓存/恢复来源/相同污染预检零修改、安装拒绝并恢复、恢复异常不得报成功。新增44例，更新测试共83例。
- 短team skill通过宿主支持的派发参数显式关闭父历史继承，仍保留最小充分上下文、队长独立产物、文件归属和按任务选择low/high/max。README、CURRENT和当前计划入口同步；package、lock根版本及两manifest同步0.8.3。

**验证证据**

| 检查 | 实际结果与边界 |
| --- | --- |
| 修复前负例 | 额外skill安装反例1/1失败，错误为Missing expected rejection，证明确实能识别原缺口 |
| 成员定向回归 | update83 + native7 + CLI pack6，**96/96通过**，0 fail/cancelled/skipped，30.639秒 |
| 队长全量回归 | Node v24.21.0，`node --test --test-concurrency=4 --test-reporter=tap tests/*.test.js`，**407/407通过**，0 fail/cancelled/skipped，86.308秒；检查实际测试数量及退出码 |
| 临时官方宿主 | 0.8.3缓存正好4文件4211字节；来源移除后仍发现team，零插件MCP/hooks、没有项目状态、没有推理，App Server确认退出，临时home已清理 |
| 临时官方CLI更新 | 真实0.8.2→0.8.3，实际缓存与候选字节一致；先恢复0.8.2基线，再在官方CLI实际安装0.8.3且确认新字节后注入失败，回滚恢复原0.8.2字节；共31次CLI调用，临时home已清理 |
| 版本与候选 | 五处版本均0.8.3；候选5文件4620字节（含marketplace描述），skill与源码逐字一致、无链接、外置依赖或运行时 |

官方CLI测试只有失败注入由受控适配器产生，其安装、卸载、来源切换和恢复均调用本机官方CLI。该证据区别于测试fixture的复制模拟；两者都没有进行模型推理或修改用户正式Codex配置。strict→native的成功/恢复本轮只在受控测试验证，不冒称真实严格安装迁移。

完整计数、源码SHA256、候选文件清单、原始日志路径、成员交接与限制见 [results.json](evidence/fix-0.8.3-2026-10-16/results.json)，修复前输出见 [负例](evidence/fix-0.8.3-2026-10-16/negative-control.txt)。候选目录：

```text
/private/var/folders/ds/crz3lj6n3vnf2q4kx5xhnzpm0000gp/T/teams-upgrade-083-eTyq8a/marketplace-v0.8.3-native
```

**交付与剩余边界**

实际交付在指定主目录，本轮改动未暂存；开工HEAD `dc4c50b269c036bbcc1373edd3156c1f57b0045a` 与index tree `f4f0ab27c1183b433cade182976c1bc0fccf248b` 保持。没有跨worktree未同步内容、正式update、commit、push或历史清理；apply-claim真实仓库干净。源码与候选升级不代表已加载的0.8.2 skill会热更新。

native清单按当前实际包形态严格检查；若未来官方宿主引入必要侧文件，需先用真实回执确认，再明确调整允许集合。strict运行依赖仍不逐文件核对，检查后的外部并发漂移仍不保证。原生/桌面停止、实际模型回执、小模型、可比速度与费用实验不在本轮交付范围。

历史0.8.2更新探针记录的是修复前行为，应在相应旧快照复现；当前0.8.3以正式回归及本轮官方CLI证据为准，不为保持旧反例“成功”而放宽新校验。
