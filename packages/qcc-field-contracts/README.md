# qcc-field-contracts

企查查字段契约共享层；不包含网络、账号、DSH UI 或 Excel 操作。

## 安装

发布后使用 `npm install qcc-field-contracts@0.1.0`；发布前以本地 tarball 验证。

实际控制人四字段只接受完整且唯一记录，比例保持原始字符串。多条、分页、缺失、格式异常分别返回字段级原因；不自动选择第一条，不将实控人误当法定代表人。
