# 0.8.3 native build/update 独立异常路径审查

交付身份：独立审查成员，不是最终验收人。未修改源码、测试、共享文档；未 commit/push；未读写正式 Codex 配置或正式插件缓存。临时文件全部在 `/tmp/codex-native-audit-JsNqIkJM`（macOS realpath 为 `/private/tmp/codex-native-audit-JsNqIkJM`）。

环境与范围：源码 `/Users/anshunli/单纯回话/codex-agent-teams`，HEAD `6d263a8670c32e24005a2f893087324531ca91cf`；Node `/Users/anshunli/.nvm/versions/node/v24.21.0/bin/node`，v24.21.0；官方 CLI `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，0.163.0-alpha.10.2。已读 `docs/CURRENT.md`、`skills/team/SKILL.md`、tooling-review-dpsv4。已在执行测试前记录固定提示“一下是验证环境，可提前查看代码改动了”。

已逐段检查 `scripts/build.js`、`scripts/update.js`、`src/plugin-package.js`、`src/plugin.js` 及 `tests/native-plugin.test.js`、`tests/update.test.js` 的相关覆盖。没有重复执行全量 412 测试、覆盖率或既有官方 smoke。新增探针先以真实临时文件系统/受控 CLI 适配器验证 4 个假设，再以官方 CLI 的临时 home 对这 4 个异常做了复核；没有启动 App Server 或模型推理。

## P1：并发更新的回滚会删除另一更新器已经成功安装的版本

- 位置：`/Users/anshunli/单纯回话/codex-agent-teams/scripts/update.js:155`（只检查 workspace idle，无 CODEX_HOME 级更新互斥），`:174`（来源冲突触发 catch），`:183`、`:185`、`:189`（无所有权比较地删除当前插件、当前 marketplace 并重装最初快照）。
- 触发条件：两个更新器共享同一 CODEX_HOME。A 已安装自己的 0.8.3，但尚未执行最后的 marketplace list；此时 B 从 A 的当前状态完成合法更新到 0.8.4 并成功返回；随后 A 继续最后检查。
- 数据链：A 读取 0.8.2 旧状态 → A 安装 0.8.3 → B 读取 A 的 0.8.3、安装 0.8.4、成功返回 → A 发现 marketplace 不再是 A → A catch 删除当前 0.8.4 并恢复最初 0.8.2。
- 期望：更新器串行化；或发现冲突后不得回滚/删除他人的已提交结果。
- 实际：官方 CLI list 最终为 0.8.2；B 成功回执的 0.8.4 installedPath 已不存在。A 的错误同时声称“原 marketplace 与插件安装状态已恢复”。B 的成功状态被静默撤销。
- 实际执行命令：`/Users/anshunli/.nvm/versions/node/v24.21.0/bin/node /tmp/codex-native-audit-JsNqIkJM/official-update-races.mjs`。
- 可核对证据：`/tmp/codex-native-audit-JsNqIkJM/official-races-lINlkT/results.json` 第一项；`.../concurrent-updates/successful-b.json`、`commands.jsonl`、`b.stdout`、`b.stderr`。B 回执 version=0.8.4，最终 list version=0.8.2，bCacheDeleted=true。
- 模拟/真实区别：调度点由探针刻意拦截在 A 最后一次 list 之前；B 是第二个真实 Node 进程；marketplace 注册、安装、卸载、缓存删除和最终 list 均由官方 CLI 实际执行。没有进行随机调度压力测试，也没有证明发生概率。
- 影响：任何共享 home 的两个更新进程，不限同一 workspace；旧版本/新版本不同及同版本不同内容均有事务所有权问题。

## P2：未知 build.mode 会绕过 native 四文件白名单

- 位置：`/Users/anshunli/单纯回话/codex-agent-teams/scripts/update.js:42`、`:49`、`:63`；`/Users/anshunli/单纯回话/codex-agent-teams/src/plugin-package.js:81`。
- 触发条件：准备好的 native 候选被改成 `build-info.json.mode="native-typo"`，增加一个空 `src/` 和 `extra-runtime.js`。模式既不是 native 也不是 strict。
- 数据链：pluginTarget 透传未知 mode → installationIdentity 仅在 mode 精确等于 native 时检查完整目录清单 → 任意其他 mode 只要求 src 目录存在 → 安装及安装后身份比较均接受。
- 期望：未知 mode 在任何安装变更前被拒绝；native 包不能通过 mode 拼写错误切换到宽松目录检查。
- 实际：官方 CLI 成功安装；更新器返回 v0.8.3 成功；缓存包含原四文件以外的空 src 与 extra-runtime.js。没有执行 extra-runtime.js；这说明目录边界校验被跳过，不代表额外文件自动获得执行权。
- 实际执行命令：`/Users/anshunli/.nvm/versions/node/v24.21.0/bin/node /tmp/codex-native-audit-JsNqIkJM/official-anomalies.mjs`。
- 证据：首次结果 `/tmp/codex-native-audit-JsNqIkJM/official-anomaly-results.json` 第二项；`/tmp/codex-native-audit-JsNqIkJM/official-unknown-mode/result.json`、`commands.jsonl` 和该 home 的实际缓存。
- 模拟/真实区别：候选损坏由探针构造；所有安装命令、缓存复制和官方插件列表真实执行。正常、未改动的 `packNativePlugin` 会输出 native，故此问题影响 prepared-package 边界，或 build 与 install 之间被其他进程改动的候选，不能直接推断干净源码默认单次 build/update 会触发。

## P2：候选 manifest.version 未复核，更新器成功版本与官方实际安装版本相矛盾

- 位置：`/Users/anshunli/单纯回话/codex-agent-teams/scripts/update.js:122`（只比较 build-info 与 package.json）、`:170`、`:172`、`:179`（安装后仍用 build-info 产生回执）；对照 `/Users/anshunli/单纯回话/codex-agent-teams/src/plugin-package.js:46`，build 阶段原有 manifest 一致性校验没有在 install 边界重做。
- 触发条件：合法 native 包构建后，仅将 `.codex-plugin/plugin.json.version` 改为 99.0.0，保持 package.json/build-info 为 0.8.3。
- 数据链：更新器预检将 build-info 0.8.3 与 package 0.8.3 比较通过 → 官方 CLI 读取 manifest 99.0.0 并写入 99.0.0 版本缓存 → 更新器将缓存字节与已经损坏的候选比较 → 继续读取 build-info 并返回 version=0.8.3 成功。
- 期望：候选版本不一致应在 marketplace/cache 变更前被拒绝；成功回执应与官方 list 的版本一致。
- 实际：官方 list `installed[0].version="99.0.0"`，缓存路径尾部为 `/99.0.0`；installPreparedPlugin 成功返回 `version="0.8.3"`。
- 实际执行命令：同上 `node .../official-anomalies.mjs`。
- 证据：首次结果 `/tmp/codex-native-audit-JsNqIkJM/official-anomaly-results.json` 第一项；`/tmp/codex-native-audit-JsNqIkJM/official-manifest-version-mismatch/result.json` 和 `commands.jsonl`。
- 模拟/真实区别：构造候选版本冲突；官方 CLI 的 manifest 版本选择、99.0.0 缓存和插件列表均真实。和前项相同，此项涉及构建后的候选损坏/TOCTOU 或直接调用 exported installer，不是声称干净构建本身输出冲突版本。

## P2 / 明确失败边界：旧来源在旧缓存删除后漂移，恢复会安装漂移内容，无法保留旧字节

- 位置：`/Users/anshunli/单纯回话/codex-agent-teams/scripts/update.js:165`（最后一次来源检查）、`:167`（删除唯一旧缓存）、`:186`、`:189`（再次从可变旧来源安装）、`:195`（安装后才确认旧身份）。
- 触发条件：最后来源检查已通过；官方 CLI 已成功删除旧缓存；新安装失败的同时，另一进程改写旧来源的 SKILL.md。
- 数据链：旧缓存内容只保留 hash，没有保留不可变快照 → 删除旧缓存 → 来源漂移 → 从该来源回装 → 事后身份比较失败。
- 期望：若承诺失败后保留旧安装，需要从不可变备份恢复；至少在回装前再次校验，避免先安装不匹配内容。
- 实际：旧缓存已经由真实 CLI 删除；回装缓存存在且 enabled=true，SKILL.md 是漂移后的内容，原字节已丢失；错误明确包含“恢复未完成：旧缓存内容未恢复”。此项没有把失败错误报告为成功，不能与 P1 的跨事务回滚混为一谈。
- 实际执行命令：同上 `node .../official-update-races.mjs`。
- 证据：`/tmp/codex-native-audit-JsNqIkJM/official-races-lINlkT/results.json` 第二项；`.../rollback-source-drift/commands.jsonl` 及实际旧版本缓存中的 SKILL.md。
- 模拟/真实区别：新安装错误和另一进程的文件改写是受控注入；旧缓存的实际删除、旧来源的实际重新注册与重新安装使用官方 CLI。该边界与 CURRENT 中“检查后其他进程仍可造成漂移”的提醒有关，交给主线决定是否属于本次上线保证的明确排除项。

## 复跑与覆盖限制

- `probe.mjs`：4 个假设的受控命令适配器最小复现；真实临时目录/文件/安装副本。命令：`/Users/anshunli/.nvm/versions/node/v24.21.0/bin/node /tmp/codex-native-audit-JsNqIkJM/probe.mjs`。
- `official-anomalies.mjs`：2 个损坏候选，官方 CLI / 临时 home。命令见上。
- `official-update-races.mjs`：并发事务、晚期来源漂移，官方 CLI / 临时 home。命令见上。
- 三个脚本均已改为每次产生新的临时 run 子目录，可直接复跑；首次证据保持原路径。脚本修改后均通过 `node --check`。
- 现有覆盖证据：native-plugin 已覆盖 skill 来源三级符号链接、现有输出保护、输出父链接进入 skills；update 已覆盖候选/旧缓存/恢复来源的额外项与部分链接、注册阶段来源漂移、安装后污染、假恢复回执、same-version 内容变更、strict→native。新增四假设没有对应的现有 case。
- 仍未覆盖：进程被 SIGKILL/系统断电后的跨进程恢复；Windows/Linux 的宿主实现；不同官方 CLI 版本；实际模型/桌面新聊天加载；任意恶意同权限进程在每个系统调用之间改链接的穷举；随机并发压力与发生概率。Strict 依赖内容没有重新逐文件验收。
- 最后复核仓库 HEAD 仍为上述 SHA，`git status --short` 无输出。没有更新 docs/STATUS.md，因为本任务明确禁止成员修改共享文档。

不能由本成员结果单独宣布可上线。建议主线至少处理或明确排除 P1 并发更新语义，并将另外两个候选语义检查遗漏及恢复窗口纳入总验收结论。

复跑确认：受控四例重新通过断言，最新结果 `/tmp/codex-native-audit-JsNqIkJM/controlled-run-bSAKz2/results.json`；两个官方异常用例重新复现，最新结果 `/tmp/codex-native-audit-JsNqIkJM/official-anomalies-FiXY3W/results.json`。原始证据均保留。
