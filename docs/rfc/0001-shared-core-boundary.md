# RFC 0001 — 本地 M0/M1 共享边界

状态：本地实施；2026-09-06。拆分参照 ee8dafb / v0.8.2；保留 cwd 用户补丁。

先冻结旧插件 24 个 golden case 与工具、路由、任务、制品源码指纹，再抽取 parseCsv 纯函数。旧 CSV 的宽松行为放在 legacy-csv 子路径，不将历史容错强加给新 XLSX 安全入口。旧 QCC Bridge、128 字段、安全门与所有 UI 均原位保留。

新 core 接受字段目录与 Provider 契约，输出 schemaVersion=1 的 DocumentSchema、FillOpportunity、FillPlan、ChangeSet。默认只写真空白或纯空白字符串；公式、错误、占位符、隐藏区和歧义不自动写。覆盖不在 M1 支持范围，明确拒绝。

以有界 ZIP 校验、XML 解析、原 XML 单元格替换实现 XLSX 副本写回。未知复杂结构拒绝；保留未编辑 ZIP entry 的解压后字节。只保留受支持的格式，不承诺任意 Excel 保真。

Provider M1 仅 mock；零网络，无 OAuth、无真实企业事实。企业字段由 provider 包定义。预览带来源、时间、置信度、成本、未完成原因。执行以输入摘要和计划摘要绑定，原件不覆盖；输出目录独占创建。

跨仓消费以 npm pack → 独立临时消费者安装 tarball → 完整旧 check + golden parity 作为门禁；不依赖工作区符号链接。暂不发布，不确定 npm scope。
