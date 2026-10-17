# 拟发通知（仅本地草稿，未发送）

以下沿用交接中的既有成员，不创建或启动任务，不确认成员已退出。合同保持 revision 2，队长不代成员确认。

## provider

你仍拥有 src/store.mjs、tests/store.test.mjs。请按 revision 2 完成 missing 返回 tagged missing，并拒绝所有非字符串或空字符串 id。当前 `loadRecord(42)` 未拒绝，队长测试 available: non-string id rejects under revision 2 已复现；空字符串和 found 当前通过。请在自己单测覆盖 found、missing、非法 id（含 truthy 非字符串），报告命令/退出码/实际用例数、Node v24.21.0 环境、当前源码/测试/合同指纹及运行前后是否变化。不要修改队长的 tests/integration.test.mjs；lead 负责失败项复验和后续全套。

operations 记录你 format 了 src/banner.mjs，此文件不在你的 owns 中。请停止对该路径写入，说明格式化范围，与原 owner/队长明确归属转交后协调恢复或接受。原 owner 当前未知；lead 没有该文件写权，因此不会覆盖或直接回滚。无关 notes.txt 的 edit 记录属于 lead，无需替它背书。交接未完成前不启动 fullSuite 或写 dist。

完成条件：revision 2 语义与自己的测试一致；提供当前可复核证据；越界操作有明确协调结论，不以整树 git diff 替代归属记录。不要把待完成项写成通过。

## card

你仍拥有 src/card.mjs、tests/card.test.mjs。请显式确认 revision 2 的 tagged found/missing 与 reject 语义，复核所有 doubles。旧日志之后你修改了 src/card.mjs，旧绿测不再覆盖当前文件；lead 现已重跑当前局部 double 测试通过，并测得真实 found 为 `Record: a`。请说明相对基线新增冒号是否有意、是否符合兼容预期，补上编辑后的 found/missing/reject 局部证据。provider missing 未 ready 时可用符合 revision 2 的 double，但真实 missing 验收保持 pending。不要修改 provider、list、banner 或队长的集成文件。

完成条件：确认版本、展示变更意图、提供自己最新源码/测试/依赖状态与实际用例数；provider 交接后的真实集成由 lead 执行。

## list

你仍拥有 src/list.mjs、tests/list.test.mjs。请显式确认 revision 2，复核 tagged doubles，并提供当前实现的 found/missing/reject 局部证据。此前未附命令的 ready 说明不足以验收；lead 本轮已补跑当前 missing-double 测试和真实 found 集成，均通过。真实 mixed found/missing 仍依赖 provider。不要改写 provider/card 或队长集成文件。

完成条件：确认 revision 2、说明当前实际变化、提供命令/退出码/数量/Node 环境/前后指纹及剩余依赖。不得把 double 通过升级为真实 mixed 集成通过。

## lead 后续责任（本地待办）

保持 contract.json 的 revision 2 及现有文件归属。确认 banner 的归属和修复安排；收集两个消费者的显式确认。provider 交接后复验非法 id 失败项、真实 missing 两项及相关消费者；状态稳定后运行 npm test，并核对当前 11 项实际执行。最终构建与 fullSuite 由 lead 持有；目前没有 build 脚本且 dist 未授权，先取得明确构建定义及合法输出安排，再执行。不得伪造 build 成功，不安装工具补位。
