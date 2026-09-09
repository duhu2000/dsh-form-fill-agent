# AI填表智能体

## 安装与三分钟上手

AI填表智能体：支持自动填表、表格填充、表格补全、Excel填表与 Excel回填；使用企查查 MCP 填写 XLSX 空白字段，预览确认后导出新副本。

```sh
dsh plugin --profile web add dsh-form-fill-agent@0.2.18
```

请先满足下文的 DSH、连接器及侧边栏依赖要求；安装后完整停止并重启对应 Profile。

打开“AI填表”并展开合成演示，选择客户台账模板，检查工作表、企业主体和空白字段。需要真实补全时确认数据来源及范围并手动发送指令；核对单元格预览后下载新 XLSX 副本。

**流程样例（示意，非真实调用结果）：** 合成客户台账的空白字段 → 字段映射和主体核验 → 单元格级事实/来源预览 → 人工确认 → 新 XLSX 与变更清单。

**能力边界：** 仅支持当前文件安全规则允许的 XLSX；不支持 Word、宏、图片和复杂布局。默认只填空白，不用模型猜值；查询使用用户已授权 MCP 账号额度。

**升级与回滚：** 升级前停止 Profile 并备份任务目录，记录当前精确版本；使用上面的固定版本命令升级，再完整重启。回滚时将版本号替换为升级前记录的版本，并使用升级前任务目录副本；不以旧版直接读取已迁移任务目录。

相关智能体：[数据清洗补全](https://github.com/duhu2000/dsh-data-cleaning-agent) · [AI填表](https://github.com/duhu2000/dsh-form-fill-agent) · [访前尽调](https://github.com/duhu2000/dsh-pre-duediligence) · [招投标](https://github.com/duhu2000/dsh-tender-workbench)


[![npm](https://img.shields.io/npm/v/dsh-form-fill-agent)](https://www.npmjs.com/package/dsh-form-fill-agent)
[![GitHub release](https://img.shields.io/github/v/release/duhu2000/dsh-form-fill-agent)](https://github.com/duhu2000/dsh-form-fill-agent/releases)

AI填表是 DeepSeek Harness（DSH）的企业表格填写插件：识别已有 XLSX 中的空白字段，通过企查查 MCP 补全工商信息，展示单元格级预览，在用户确认后生成新的 XLSX 副本。

由企查查 MCP 服务团队开发。产品仍处于 alpha 阶段。

## 安装

需要 Node.js 22 或以上，以及 DSH。已验证的 DSH 基线为 0.1.1-rc.2 和 0.1.2-alpha.2。

```sh
dsh plugin --profile web add dsh-form-fill-agent@latest
```

建议先使用专用测试 profile。在 DSH 设置中配置模型，并连接已授权的企查查企业 MCP；进出口及风险字段还需对应经营、风控 MCP 工具。插件不附带模型或企查查访问凭据。

## 使用流程

1. 从 DSH 的“AI填表”入口进入专属会话，打开工作台并上传 XLSX。
2. 首次分析仅识别表格结构、主体锚点和空白字段，不发起企查查查询。
3. 点击“提示词生成”，依次核对数据来源、填写规则、填写字段和任务描述。回填时可替换或追加已有草稿；随后手动发送，由模型调用 form_fill_enrich 查询。
4. 在“填写预览”检查各单元格的事实值、来源及未完成项，可排除不需要填写的单元格。
5. 确认后下载新 XLSX 副本、变更清单和未完成清单。原文件不覆盖，已有内容默认保留。

同源独立入口为 /form-fill/。工作台附带客户台账、供应商准入表和合同主体信息表三套合成演示，不使用真实客户数据。

## 当前能力

- 企查查蓝深浅色界面，左上角“新会话”与“工作区”之间的 AI填表入口、专属首页和线性图标。
- 四步向导支持字段搜索、勾选、草稿恢复；所选字段持久化并限制真实查询与填写范围。
- 结果筛选显示当前/总数及已选格数，下载始终包含全部确认内容。
- 简单 XLSX 安全解析、工作表与表头识别、企业名称或信用代码锚点识别。
- 确定性字段语义映射、只填空白、单元格级预览与来源追溯。
- 133 字段目录：工商、企业简介、联系方式、上市、开票、进出口、自身及关联风险、实际控制人。唯一完整实控人记录可填写，多名/分页/异常留空待核验。事实和确定性摘要区分来源，不生成风险结论。
- 五步工作台、指令回填、任务历史、可恢复单元格选择、取消/失败重试与重启恢复。
- 可选择工作表、表头行并修正字段映射；修改后需重新预览。
- 查询主体不一致时展示返回候选，人工选择或补充已核验的完整主体后重新查询，原表名称不覆盖。
- 内嵌固定选项下拉列表原样保留，超出选项的事实值列为未完成项。
- 共享内核 form-fill-core 和企查查适配包 qcc-form-fill-provider。

## 使用边界与数据保存

补充要求为模型可读文本；字段或工作表范围请通过向导/工作台修改，不能仅改文字后假定执行范围已同步。任务 schema 5 可读取 schema 1–5；回退旧版本请使用升级前目录副本或独立任务目录。主包为 0.2.18，共享内核为 0.2.10，Provider 为 0.2.1，共享字段契约为 0.1.0。

支持企业完整登记名称或 18 位信用代码；简称、主体不一致或多候选不会自动猜选。仅有信用代码的表格也可作为查询锚点。连接候选检索工具时可检索简称，仍需人工确认；缺少工具时降级人工输入。字段映射采用确定性规则及人工确认，不让模型编造事实。支持普通内部公式、固定区域下拉、基础条件格式和普通表格对象；复杂 Excel 结构和 Word 暂不支持，保真边界见下方安全说明。

真实查询使用用户连接的企查查 MCP 账号，积分规则以该账号为准。模型服务也需单独配置。

显式设置 DSH_HOME 时，任务保存至其 form-fill-tasks 目录，默认 24 小时过期；未设置时使用内存。任务保存输入表格和归一化预览，不持久化原始 MCP 响应，可主动删除任务。模型及 MCP 凭据由宿主管理。

0.2.18 保存任务 schema 5，兼容读取旧 schema 1–4；回退旧版本须使用升级前任务目录副本或新目录，防止丢失已确认的字段/主体设置。

## 文档与反馈

调用次数：默认无本地次数上限。可通过 DSH_FORM_FILL_MAX_CALLS 设置正整数上限，0 或未设置表示不限；修改后重启 DSH。这不是企查查余额或积分配置，上游服务限制仍有效。

- [源码与完整说明](https://github.com/duhu2000/dsh-form-fill-agent)
- [安全与保真边界](https://github.com/duhu2000/dsh-form-fill-agent/blob/main/docs/security.md)
- [双基线原生验收](https://github.com/duhu2000/dsh-form-fill-agent/blob/main/docs/U2-NATIVE-ACCEPTANCE.md)
- [版本记录](https://github.com/duhu2000/dsh-form-fill-agent/blob/main/CHANGELOG.md)
- [问题反馈](https://github.com/duhu2000/dsh-form-fill-agent/issues)

MIT License.
