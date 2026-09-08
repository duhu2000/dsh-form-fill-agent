# 搜索发现与安装验收

拟议市场中文描述：AI填表智能体：支持自动填表、表格填充、表格补全、Excel填表与 Excel回填；使用企查查 MCP 填写 XLSX 空白字段，预览确认后导出新副本。

拟议英文描述：AI form filling and spreadsheet autofill for XLSX in DeepSeek Harness, using authorized Qichacha MCP facts with cell previews, user confirmation and export to a new copy.

npm keywords 已在包清单内更新。GitHub description 建议使用上述英文描述；topics 在保留现有项的基础上加入：dsh-plugin, form-filling, spreadsheet-autofill, xlsx, enterprise-data。

市场只检索登记字段，不读取 npm keywords、README 或 GitHub topics。默认下载排序保持原规则；不承诺文案直接提升默认排名。

固定查询：AI填表 / AI 填表 / 自动填表 / 表格填充 / 表格补全 / Excel填表 / Excel回填 / form filling / spreadsheet autofill / 企查查MCP / 企查查 MCP。

验收：使用实时完整目录和原版搜索函数对比登记描述更新前后；记录语言、命中位置、结果数与版本。独立目录缺失条目必须标为未上线，不能把模拟添加的结果当作上线结果。

发布清单：完成仓库 check；审核 README 与包清单差异；如需让 npm 展示更新内容，另行授权一个新的补丁版本并按项目发布流程执行。当前改动未更改版本，不得覆盖已发布版本或移动 tag。仅登记 YAML 更新无需发布 npm。

## 安装与三分钟上手

AI填表智能体：支持自动填表、表格填充、表格补全、Excel填表与 Excel回填；使用企查查 MCP 填写 XLSX 空白字段，预览确认后导出新副本。

```sh
dsh plugin --profile web add dsh-form-fill-agent@0.2.15
```

请先满足下文的 DSH、连接器及侧边栏依赖要求；安装后完整停止并重启对应 Profile。

打开“AI填表”并展开合成演示，选择客户台账模板，检查工作表、企业主体和空白字段。需要真实补全时确认数据来源及范围并手动发送指令；核对单元格预览后下载新 XLSX 副本。

**流程样例（示意，非真实调用结果）：** 合成客户台账的空白字段 → 字段映射和主体核验 → 单元格级事实/来源预览 → 人工确认 → 新 XLSX 与变更清单。

**能力边界：** 仅支持当前文件安全规则允许的 XLSX；不支持 Word、宏、图片和复杂布局。默认只填空白，不用模型猜值；查询使用用户已授权 MCP 账号额度。

**升级与回滚：** 升级前停止 Profile 并备份任务目录，记录当前精确版本；使用上面的固定版本命令升级，再完整重启。回滚时将版本号替换为升级前记录的版本，并使用升级前任务目录副本；不以旧版直接读取已迁移任务目录。

相关智能体：[数据清洗补全](https://github.com/duhu2000/dsh-data-cleaning-agent) · [AI填表](https://github.com/duhu2000/dsh-form-fill-agent) · [访前尽调](https://github.com/duhu2000/dsh-pre-duediligence) · [招投标](https://github.com/duhu2000/dsh-tender-workbench)
