# 独立前向演练归档

本目录从本轮临时 exercise 复制，保留样本源码、合同/操作/受控宿主记录、成员测试、报告与失败资料；省略 `.git`。原始 JSON/日志中的绝对路径和时戳按实际执行保留，父子模型、账户用量和基线没有由模拟记录推断。

- `review/handoff-review.md`：provider/card/list 的当前交接判断，局部3/3与部分集成5/6；真实非法id失败保留，原样本HOLD。
- `review/member-notifications.md`：只保存本地的三方通知，没有真实发送回执。
- `review/retrospective.md`：来源/未知值/累计用量归属边界。
- `review/concurrent/report.md`、`evidence.json`：真实Node子进程握手使输入在验证期间变化；绿测1/1仍HOLD，输入稳定后同用例1/1再接受该独立样本。
- 并发记录器的两次搭建失败留在 `setup-attempt.json` 与 `setup-ipc-attempt.json`，不算成功验收。

这是证据归档，请勿直接在本目录重跑并覆盖资料。需复现实验时先复制到新的临时目录，建立独立Git基线以满足记录器对 `.git/index`/`.git/HEAD` 的检查，并仅在复制品内移走旧输出。并发样本使用 `node run.mjs first` 再 `node run.mjs stable`；子进程需要IPC，不能把 validate.mjs 当成独立CLI。归档并未自动创建另一份可写工作树或授予成员额外文件权限。
