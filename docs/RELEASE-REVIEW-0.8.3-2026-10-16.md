# 0.8.3 发版复核（2026-10-16）

当前验证范围内，未剩余确认的native发布阻断bug。建议本次发布默认native包；strict仍保留显式可选能力，其真实桌面停止和跨平台验收不属于本次稳定发布证据。版本保持尚未发布的0.8.3，不另增版本号。

本轮已直接完成两处小修，并补齐对外安装说明。代码、发行包与验证结果已就绪；尚未发布、commit、push、tag或修改用户正式安装。**当前暂存区package仍为0.8.2，工作树为0.8.3，直接提交现有暂存区会漏掉本轮修复。** 源码发版前必须将已验收的完整工作树变更纳入对应提交；本轮遵循现场保护约定，没有代为暂存。

**发现与处理**

| 事项 | 判断与处理 |
| --- | --- |
| 无依赖CLI未知命令误报 | 已修。原来typo先加载strict依赖，报缺zod；现在在动态导入前校验白名单，准确报Unknown command: typo。完整src、无node_modules回归覆盖退出码和stdout/stderr。属于小型可用性问题。 |
| native发布metadata没有完整校验 | 已修。三处version同时缺失或非法时仍能打包；现在校验本项目的SemVer发布格式及非空name/description，允许合法prerelease/build标识。native manifest只允许当前name/version/description/skills字段。属于防止错误发行产物的补强，不声称旧0.8.3合法产物已经损坏。 |
| 对外安装入口容易误选 | 已补README。源码根没有marketplace清单，官方CLI直接添加源码根实际失败；发行的是生成的native marketplace压缩包。用户解压安装无需Node，源码构建才需要Node24。没有为源码直装复制另一份永久skill目录。 |
| 更新/恢复链路 | 本轮未发现新的高价值阻塞。独立86/86定向通过；临时官方CLI验证首次复制权限失败后注册/缓存清理、跨版本损坏恢复旧字节、缺installedPath精确路径回退、禁用预检零修改。 |
| CI默认native路径 | 已有覆盖，不重复新增。无node_modules和空PATH的源码副本已在native测试中运行。两处Actions固定SHA的action.yml均可读取；本轮未执行GitHub runner矩阵。 |

官方manifest资料确认apps属于资源入口，agents不是宿主声明资源字段。额外字段原样透传不等于会执行；本轮限定项目native manifest形态，没有把受控透传反例夸大为执行漏洞。依据：[marketplace格式](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/marketplace.rs)、[manifest解析](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manifest.rs)。当前本机实际CLI行为优先于跨版本推断。

**最终验证**

- metadata新增反例在旧实现上4项中3失败、1通过；修后包含在最终全量。成员CLI交接的14/14是新增metadata用例前的定向结果，不冒称它验收了全部最终修改。
- 队长Node v24.21.0统一全量 **412/412通过**，0 fail/cancelled/skipped，81.888秒，检查实际计数与退出码。更新审查成员定向86/86及官方CLI探针另有交接，不叠加成成功率。
- 通过正式build入口准备native包，压缩为tar.gz，再解压逐文件核对SHA256；官方CLI安装解压产物，缓存字节一致。移除解压来源后，真实宿主只发现codex-agent-teams:team，零插件MCP/hooks，没有模型推理，App Server退出，临时home清理。
- 已验证宿主为macOS arm64、Codex CLI0.162.0-alpha.17.2。原生能力由宿主提供，不宣称任意旧版本或未测平台都兼容，也不宣称并行提速、降本或实际模型路由已验证。

发行资产：

```text
/private/var/folders/ds/crz3lj6n3vnf2q4kx5xhnzpm0000gp/T/teams-release-review-U9tDHN/codex-agent-teams-native-0.8.3.tar.gz
/private/var/folders/ds/crz3lj6n3vnf2q4kx5xhnzpm0000gp/T/teams-release-review-U9tDHN/codex-agent-teams-native-0.8.3.tar.gz.sha256
SHA256: 6d37ba78c331d41c5189ed172b8d8d27f8932fdee0062132f1555915cca08767
```

当前压缩文件3515字节，marketplace内5个文件，原生插件缓存4文件。构建时间写入build-info，因此重新构建的压缩文件校验值可以不同，应为每次发行资产生成自己的清单。原始交接、源码SHA、测试计数和资产验证见[结构化证据](evidence/release-0.8.3-2026-10-16/results.json)。

**发版前需要维护者完成的动作**

1. 将已验收修复纳入源码提交，核对提交版本与发行资产，再选定tag；不要只提交当前旧暂存区。
2. 在正式发布提交上跑现有Ubuntu/macOS、Node24最低/最新四组CI；本机通过不能替代远程矩阵。
3. 明确对外使用许可或条款。仓库目前没有LICENSE；本轮没有擅自选择许可证，也不把许可选择当运行时bug。
4. 上传已验证的native压缩包与SHA256清单，并按README说明安装入口。当前GitHub源码根不支持直接作为marketplace，若要Git来源一键安装，需另行设计发行目录或分支。

没有必要为本次发行增加固定开队、外置调度器、自动模型选择、状态页、数据库或强制二次审查。小模型选择、精确费用、可比性能对照和Git来源直装可后置。strict依赖未逐文件核对、检查后的外部并发漂移继续按既有边界说明。

交付主目录为/Users/anshunli1/asl/code/github/codex-agent-teams，开工HEAD及index tree保持；本轮改动未暂存，无跨worktree未同步内容。apply-claim真实源码未改，用户正式插件安装未更新。
