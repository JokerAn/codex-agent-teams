# 0.6.1 启动卡点复查与修补

日期：2026-10-14，Asia/Shanghai。用户要求：“再次检查一遍如果有问题先修复卡点 要不总是失败”。

源码和候选包的启动修补已完成，真实模型 schema 请求通过；正式安装仍为 0.6.0，因为真实配置/缓存替换的自动审批要求用户明确授权，安装脚本未执行。不能把候选包通过写成当前聊天已运行修复后的插件。完整验证回执见 [证据 JSON](STARTUP-FIX-0.6.1-2026-10-14-EVIDENCE.json)。

## 1. 本次确认的卡点

- 主目录 `src/contracts.js` 已有 required limitations 修补，正式缓存 `0.6.0/src/contracts.js` 仍缺该字段。当前 marketplace 来源仍为 `/Users/anshunli1/asl/code/github/codex-agent-teams/dist/marketplace-v0.6.0`，缓存 build digest 为 `b7ffffe62d166f8371e881031f01bdea1221271297e3d6cc5668be272644ab5c`。此前真实失败记录已确认这个 schema 被模型服务拒绝，不能靠重复启动解决。
- 缺少发送前检查时，生成 schema 或验收合同错误会进入 App Server 启动链路后才暴露。本轮将本地校验移到创建子进程之前，保证无效输入不发起成员回合。
- 已有失败指引将明确的请求拒绝和一般回合中断归在一起，容易使队长重复相同请求。本轮仅依据官方结构化 `codexErrorInfo=badRequest` 细分；没有该字段时保留通用原因，不猜测供应商文本。

本轮由主 Agent 直接处理阻塞链路，没有启动新的项目审查成员。真实模型调用是一项限定 60 秒、禁止工具使用的 schema 兼容检查，不是代码审查或效率评测。

## 2. 最小修补

| 位置 | 改动与行为 |
| --- | --- |
| `src/contracts.js:88` | 生成 schema 的每层 object 检查 required 覆盖 properties、无多余 required，且 additionalProperties=false；验收条件按原合同 schema 校验。存量报告解析继续允许省略 limitations |
| `src/app-server.js:232` | 子进程创建、memberLaunch 和 turn/start 之前生成及检查 outputSchema；失败给 output_schema_invalid，不留下未知 launch 身份 |
| `src/app-server.js` 的失败回合分支 | 仅将官方 badRequest 归为 request_rejected，保留原始 message；普通/未知错误仍是 turn_incomplete，原退出门禁不变 |
| `src/preflight.js:27` | 两类新指引明确先修 schema/合同/配置、核对宿主实际缓存版本；不自动重试，不换模型 |
| package/lock/两 manifest | 统一 0.6.1，避免同版本源码与缓存修补程度不同造成交接误判 |

官方依据：[App Server 文档](https://developers.openai.com/codex/app-server) 的 turn/completed 错误字段；本机 Codex `generate-json-schema` 的 TurnError 含 message/codexErrorInfo/additionalDetails，CodexErrorInfo 枚举含 badRequest。生成的协议 schema 保存于 `/tmp/teams-protocol-061-20261014/`；供应商 message 的内容不是稳定分类依据。

本轮同时打入上一轮已修的 S1/S2/S3。S3 的角色动作摘要与严格协议 fixture 不重新计为新发现。

## 3. 验证及真实请求

1. 定向 `node --test tests/core.test.js tests/backend.test.js tests/preflight.test.js tests/plugin.test.js tests/observation.test.js`：93 项中 92 通过，1 项 POSIX 启动器在受限环境中打印帮助后等待退出超时。原日志 `/tmp/teams-061-blockers-targeted-20261014.log`。
2. 同一启动器单项在沙箱外复核：1/1，1682.515708 ms。没有因该环境差异改动启动器。日志 `/tmp/teams-061-launcher-recheck-20261014.log`。
3. 最终沙箱外 `npm test`：**285/285**，0 fail/cancelled/skipped，81193.436333 ms。包括本地 schema 缺顶层/嵌套 required 的拒绝、空验收无 launch、官方 badRequest 与同文本无代码错误的不同分类及退出证据。日志 `/tmp/teams-061-blockers-full-20261014.log`。
4. 候选包 24 个源码/技能/manifest 文件与主目录逐字节相同；无推理 doctor 确认 krill/gpt-6.1-sol/high 可见且只读线程权限正确；官方 SDK stdio 核对 8 个工具、版本/digest、主项目 owner=null、running=0、awaiting=0。
5. 真实临时宿主安装 smoke：实际缓存独立于包目录、skill 可发现、MCP startup=ready、8 个工具、双项目路由/owner 门禁通过；不改正式用户配置、不启动模型推理。回执 `/tmp/teams-061-host-smoke-20261014.json`。
6. 直接从最终候选包执行一次真实模型 schema 请求：**krill/gpt-6.1-sol/high，8722 ms，passed**；实际返回 summary=`0.6.1 schema accepted`，criteria 满足，findings/blockers/limitations 均为空数组；required 包含 summary/criteria/findings/blockers/limitations，cleanupConfirmed=true。host totalTokens=10890（input=10801、cachedInput=0、output=89）；没有代码审查或收益对照结论。回执 `/tmp/teams-061-live-check-20261014.json`。

模拟协议回归、真实临时宿主安装、无推理 doctor 和真实模型请求是四类不同证据。上述结果支持候选包在本机可启动及该模型接受 schema，不证明其他模型、真实写入/reviewer/集成链路、桌面 UI 热重载或远程 CI。

## 4. 可交接的候选与安装边界

- 候选目录：`/Users/anshunli1/asl/code/github/codex-agent-teams/dist/marketplace-v0.6.1-blockers-20261014`。
- 插件目录：候选下的 `plugins/codex-agent-teams`，版本 0.6.1。
- sourceDigest：`ede7058f95b8f05dabc74587ffa273dd8de72c4095fd9eb1525884cec962ca80`。
- 正式替换脚本：`/tmp/teams-061-install-20261014.mjs`。执行前检查主项目无 owner、运行任务、待验收交接和未退出 verification；通过官方 CLI 仅切换 codex-agent-teams-local 来源、卸载/重装该插件，核对新缓存版本/digest和其他 marketplace 不变；中途失败尝试恢复旧来源及旧插件。没有直接改缓存文件或 SQLite。
- 自动审批拒绝了正式替换：理由为 [AGENTS.md:13](../AGENTS.md) 的“**不自动安装到用户 Codex 配置，不发布，不进行付费长跑；相关操作以用户授权为准**”。这不是候选验证失败；安装命令未执行，本轮没有绕过审批。
- 仍需用户明确授权正式替换。替换后重新建立 Codex/MCP 会话，再核对实际查看来源与 digest；已加载的旧连接不会因主目录源码或新缓存出现而自动换成新代码。

## 5. 交付与下一步

源码、文档和候选直接交付 `/Users/anshunli1/asl/code/github/codex-agent-teams`，main，HEAD `25e15c7af5482c6533b6fbb37b7833846988f34f`。原暂存树 `e6ee32da47d9abc4450c413a53d8e97d4fee657d` 保持，本轮未新增暂存、commit 或 push；无跨 worktree 未同步内容。候选位于 ignored dist，属于此次打包验证的必要产物，没有将其纳入源码暂存。

下一步只需明确授权正式插件替换，然后从新缓存做无推理来源核对及一次有界真实复验。正式缓存还是旧版本时，不再对同一个已知错误请求盲目重试。
