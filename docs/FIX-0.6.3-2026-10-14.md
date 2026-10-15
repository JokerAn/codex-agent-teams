# 0.6.3 定点修复

依据本聊天审查和复盘，用户授权定点修复；遵循 PRINCIPLES.md 的准确性、完成效率和最小改动。交付当前主目录 `/Users/anshunli1/asl/code/github/codex-agent-teams`，HEAD `25e15c7`。主 Agent 直接完成，没有启动新成员；不复制工作区、不动既有暂存区。

## 修补

- **H2 中断归属**：host-lifecycle 将待用票据放在 pending，已成功接受的 attempt 保留在 bindings。领取/发现/校验失败不会替换已生效归属；start 和 integrate 成功返回后才提交。中断 tombstone、一次性票据与 active 跨会话拒绝保持。
- **H1 端点交接**：close 只删除 token/socket 匹配自身的端点，publish 检查实际文件、缺失时重发。生产 MCP 关闭顺序先撤销 lifecycle，再释放各项目 owner，避免新 owner 发布与旧清理交错。直接控制器接口的归属检查也保留。
- **U1 回退证据**：变更前读取实际旧缓存，保存 build-info、源码、技能、manifest/hooks/launcher/config 等关键文件的 SHA-256 身份；回退后读取实际缓存重新比较。版本相同而 digest 或源码变化会明确报告“恢复未完成”。旧安装缺少可用身份时只能报告“元数据已恢复，旧缓存内容未确认”。运行依赖没有逐文件哈希，不声称完整安装所有字节一致。
- **review 回执**：运行时验收逻辑不变，MCP 默认只返回任务/attempt、状态、下一步、退出/验证概况、verdict/authority/时间/证据数量；不重复 result、attempt 历史和长证据。完整内容仍通过 teams_status(verbose=true) 查询。英文工具描述、中文反馈、skill 和 README 同步。
- package、lockfile、两 manifest 同步 0.6.3。无新依赖、后台服务、中间发现摘要、工具白名单或并行写机制。

## 验证

定向 `node --test --test-concurrency=4 tests/host-lifecycle.test.js tests/update.test.js tests/mcp.test.js`：38/38，0 fail/cancelled/skipped，5912.771459ms，日志 `/tmp/teams-063-targeted-final-20261014.log`。

覆盖实际临时 socket/端点交错删除与缺失重发；官方 MCP SDK 重复 start、无效模型、过期 integrate 不转移归属；受控成功 integrate receipt 提交归属；同版本 build digest 和源码漂移拒绝恢复；legacy 缓存明确未确认；pass/reject 精简回执小于2000字节且完整报告/证据仍可读取。成功 integrate 归属用例隔离的是 MCP 接受回执，不冒充真实写入或模型任务。

首轮定向37/38，一项新增测试把证据末尾空格当成需保留内容，与既有 schema.trim 规则不符；修正测试输入后通过，生产校验未放宽。日志 `/tmp/teams-063-targeted-20261014.log` 保留。

全量 `npm test`：312/312，0 fail/cancelled/skipped，90004.910208ms，日志 `/tmp/teams-063-full-20261014.log`。源码与暂存 diff 格式、文档链接及版本一致性检查通过，2026-10-15 完成收尾。公开回执调整已查阅 [官方 MCP tools 规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)，保持既有 text content 结果格式和输入合同。

未执行真实模型、正式插件更新/信任操作、实际桌面停止、Linux/远程CI、同条件效率评测。当前连接仍运行已加载的0.6.2，源码变化不会热更新。

## 交付

源码和文档均在主目录，本轮改动未暂存；原暂存树 `91e10ffbec423925a342dc7437bceeb0d3218ff4` 保持。没有提交、推送、安装或修改正式配置，无跨 worktree 未同步内容。用户结束相关 Team 会话后可显式执行 npm run update，再重启新聊天核对实际版本。
