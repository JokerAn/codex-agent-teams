# 当前受控样本的简短复盘

来源：[host-records.json](../host-records.json) 的 provenance 明确为 controlled exercise records, not real account usage；任务归属与旧验证来自 [handoff.json](../handoff.json)，接手后的实际检查来自 [verification.json](verification.json)。这三种来源不混作真实生产遥测。

| 成员 | 记录的 dispatch（+08:00） | report 事件 | 能确认的设置 |
|---|---|---|---|
| provider | 2026-10-18 10:00:00 | 无 | requestedEffort=high，toolArguments.reasoning_effort=high；receipt 仅含 id |
| card | 2026-10-18 10:00:05 | 2026-10-18 10:03:00 | 工具参数 high；未单列 requestedEffort；receipt 仅含 id |
| list | 2026-10-18 10:00:10 | 2026-10-18 10:04:00 | 工具参数 high；未单列 requestedEffort；receipt 仅含 id |

记录涉及 3 名既有成员，本轮新启动 0 名。三个 receipt 不包含实际 model 或实际 reasoning effort，不能由请求参数确认实际使用的模型/强度，也不能声称降级或未降级。report 不是可靠的完成/退出时间，provider 也没有完成事件；实际完成时间未知。card 的 dispatch 到 report 相差 175 秒，list 相差 230 秒，这些只是事件间隔，不相加成总工时或节省时间。

历史队长等待没有记录，时长未知；本轮接手没有调用等待工具，而是直接完成可用检查。缺少原始启动前状态、真实完整运行时段与单代理对照，不能判断等待消除效果或并行净提速。

可归因的返工来自两处：card 在旧验证后改文件，导致旧证据不能直接沿用，本轮需重跑当前局部检查；contract 已到 revision 2，但两个消费者确认还停在 revision 1，需要重确认而非重启成员。provider 的 missing 未完及新发现的非法类型拒绝问题是尚需完成的工作，不冒称已修复。banner formatter 越界需要专门协调，不能用整树还原处理。

本轮实际执行两轮测试命令（3 项局部 + 6 项部分集成，合计 8 通过/1 失败）和一次测试文件语法检查。输入前后指纹一致；原有两项真实 missing 测试保留待验，全套与最终 build 未执行。交付是六项新增队长集成测试、命令日志、输入快照、HOLD 决定和本地成员通知。

usage 记录为 parent 10:01:00 的 total_tokens=1000、parent 10:02:00 的 total_tokens=1500、card 10:02:00 的 total_tokens=600。没有字段定义来确认累计/增量语义、parent 是否包含 child、完整采样范围或计费归属，因此不求和，也不将 500 的差值称为实际消耗，更不据此推算费用。没有真实账户数据、价格依据或可比单代理基线，成本和净效率收益均未测量。

本样本支持的判断：team skill 的合同协调、验证新鲜度、文件归属和局部/集成分层可以落实到实际检查与交接决定；它也需要队长主动读源码和补验证，才能发现“found ready”仍接受非法 id 的问题。不能由这一样本推断所有真实任务的效果。最有价值的下一步是由现有 provider 完成并交接后，再让 lead 收口真实 missing、全套和合法构建。
