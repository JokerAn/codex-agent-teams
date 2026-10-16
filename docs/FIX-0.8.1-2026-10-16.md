# 0.8.1 修复结果

用户授权按 [0.8.0 评估](EVALUATION-0.8.0-2026-10-16.md) 列出 TODO 并修复。交付目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，源码版本 **0.8.1**，正式插件缓存未更新。开工 HEAD 为 `dc4c50b269c036bbcc1373edd3156c1f57b0045a`，暂存树为 `79970972f55802ac87ec265815940405e96b775a`，既有 STATUS 改动和评估文档保留。

## 已完成

1. `src/plugin-package.js` 在创建输出前逐层核对 `skills`、`skills/team`、`SKILL.md` 类型，拒绝文件及父目录链接。读取通过校验的字节后写成普通文件，产物不再携带外部链接。不增加依赖或改变严格执行策略。
2. `tests/native-plugin.test.js` 新增三级链接、悬空目标、无输出副作用、移除源码后仍可读的回归。保留既有输出保护和无依赖/空 PATH 构建检查。
3. 后端回归通过生产 `CodexBackend.run` 验证 low/high/max 精确传入、属性省略和同 backend 并发隔离；显式 fixture 模式检查实际协议值，其他旧模式保持。实时目录撤销或不支持的强度在成员 thread/start 前拒绝，任务 pending、零 attempt，合法启动正对照证明标记有效。
4. team skill 保持19行，补明确任务强度、写入归属、共享配置统筹、短交接和有界 follow-up。用户显式选择优先，请求标签与实际回执分别记录。
5. AGENTS 改为先读短 `docs/CURRENT.md`，历史原则/路线/状态按需读取；保留严格门禁与历史证据。新增场景验收清单，统一当前 TODO 链接。
6. 新增 `npm run test:native`，`npm test` 继续全部回归；package/lock 根版本与两 manifest 同步0.8.1，未安装依赖或改变锁定依赖版本。

原生队长负责打包修复、反例和集成验收；high 成员只改三个协议/模型测试文件；low 成员只改 skill/README。队长核对实际改动，高成员另对打包路径与版本做限定只读复核，未发现阻塞；不把成员声明本身当作测试通过。

## 验证

环境 Node v24.21.0、macOS。本轮没有真实模型推理长跑；临时宿主检查使用独立 Codex home，不改变用户正式配置。

| 验证 | 结果 |
| --- | --- |
| 修复前链接反例 | 三级链接均失败，缺少预期拒绝；证明新回归能捕获旧行为 |
| `npm run test:native` | **7/7通过**，0 fail/cancelled/skipped，测试151.851ms |
| `node --test tests/backend.test.js tests/models.test.js` | 成员执行 **78/78通过**，0 fail/cancelled/skipped，66.23秒；队长复核断言，完整测试再覆盖 |
| `npm test` | 队长执行 **350/350通过**，0 fail/cancelled/skipped，测试85.115秒，脚本墙钟86.167秒 |
| 默认候选构建 | 成功，**4文件3600字节**，版本0.8.1，全部普通文件；skill与源码逐字相同，无严格运行时 |
| `node scripts/smoke-native.js` | 临时官方CLI安装和真实宿主发现通过；删除来源后仍发现缓存skill；零插件MCP/hooks、无项目状态库、无推理；临时App Server退出、用户配置未改 |
| 文档及现场 | diff格式、链接与版本检查；HEAD/index保持，既有STATUS正文和评估文档保留；改动未暂存 |

候选目录：`/Users/anshunli1/.codex/visualizations/2026/10/16/01a142a6-3115-7c21-9632-f029fdee1e94/plugin-fixes/native-candidate-0.8.1`。

本机原始日志保留在同级 `plugin-fixes/`：`native-red.log`、`native-green.log`、`full-tests.log`、`candidate-build.log`、`smoke-native.log` 及对应 JSON 回执。源码测试和文档不依赖这些本机绝对路径。

## 验证边界

- max 仅是受控 fixture 的支持值，协议验收不代表真实服务支持该强度；实际推理强度/用量/费用没有新增回执。
- 场景指引与回归通过不证明真实开发提速；真实桌面停止、同文件冲突、max/小模型效果及重复效率对照仍按 [场景清单](TEAM-SCENARIOS.md) 分别验收。
- 文件检查不承诺抵抗外部进程恶意并发替换源码的时序竞争；本轮修复的是稳定源码链接导致的便携性问题。
- 严格调度器、退出/证据门禁和写独占保持；未清理历史任务或worktree，未commit/push/正式update，无跨worktree未同步内容。
