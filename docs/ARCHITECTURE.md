# P0 实现说明

## 执行链路

当前 Codex 会话/用户 → skill → 官方 MCP SDK → TaskRuntime → SQLite + CodexBackend → 独立 App Server 进程 → 全新线程与单个回合。

状态：pending → running → awaiting_review → succeeded。成员有阻塞则 blocked；协议/结果错误则 failed；取消或截止时间则 cancelled；运行时异常退出恢复后则 interrupted。

依赖只能引用已创建任务，合同创建后不编辑，因此图不能引入循环。P0 由队长显式启动依赖已通过的任务，不驻留一个自动调度循环。最多三次有理由的执行，重试统一选 expert；上次错误、审查意见和新理由作为显式任务信息传递。

## 准确性保证与限制

每项任务的输出 JSON Schema 限定验收条目原文枚举；运行时再次检查顺序、非空证据和阻塞字段。模型自报完成只能到 awaiting_review；队长通过 teams_review 记录逐项证据。当前无法证明队长真的检查过引用，UI/文档因此使用 captain-attested，后续用真实验证命令与产物加强。

取消时先尝试 turn/interrupt，随后终止本运行时创建的进程组；完成清理后才释放并发槽。进程崩溃不会被当成成功。启动响应之前到达的完成通知也会缓存，避免丢事件。

SQLite 将任务快照与状态事件放在一个事务中。每个 workspace 唯一 owner，记录 PID 与随机 token。任务写回必须匹配有效 attempt。恢复遇到活着的旧 child PID 时保守拒绝；PID 复用可能造成保守阻塞，绝不据此杀死未知进程。

## 权限和配置

不更改用户全局 Codex 配置。每次新建线程前读取有效配置，显式禁用继承 MCP 服务器、plugins、apps、hooks、memories、多 Agent 和 web search，使用 read-only / networkAccess=false / approvalPolicy=never。实际线程响应与要求不符则不启动推理。

本机 App Server 的 config 覆盖键使用普通 dotted key；给 MCP 名字加 TOML 引号会创建错误配置。这已作为真实协议兼容回归。未来版本必须重新验收，不能仅让 fake server 随实现改动而“通过”。

不接管父线程，不调用非公开的宿主内部 spawn_agent，不继承完整父聊天，不保证主动通知已结束的主回合。

## 为什么选择这些依赖

JavaScript ESM + Node.js 24+：无编译步骤；Zod 在边界验证；内置 SQLite 持久化；官方 MCP v2 server 避免手写 MCP。客户端 SDK 仅用于真实 stdio 回归。Codex App Server 的少量 JSON 行协议由独立适配文件封装，不在业务层散落。

## 参考与兼容依据

参考设计，不复制上游实现。调研日期：2026-10-11。

- 官方 App Server：https://developers.openai.com/codex/app-server
- 官方插件包装：https://developers.openai.com/plugins/build/plugins
- 官方配置参考：https://developers.openai.com/codex/config-reference
- 官方 MCP SDK：https://github.com/modelcontextprotocol/typescript-sdk
- OMX（比较模型/任务组织）：https://github.com/Yeachan-Heo/oh-my-codex
- Symphony（执行边界和恢复思路）：https://github.com/openai/symphony
- Harness（Codex provider）：https://github.com/deepseek-ai/deepseek-harness
- 原始团队参考：https://github.com/NanmiCoder/dsh-agent-teams

使用本机 `codex app-server generate-json-schema` 核对 ThreadStartParams、TurnStartParams、模型列表与事件字段。协议模拟不是模型效果证据；实际核验记录放在 STATUS.md。
