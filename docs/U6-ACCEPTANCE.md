# alpha.9：剩余 Provider 批次与兼容收口

更新：2026-09-07。三包版本 0.1.0-alpha.9。alpha.8 的网格、选择、取消/重试与 Excel 保真全部保留；三包已发布 npm latest，安装验收见 RELEASE-alpha9-PUBLISHED.md。

## 本轮完成

先从清洗 0.8.8 / 6cea166 生成 128 字段目录快照和七组投影的 21 个 golden，随后提取纯投影代码。迁移企业简介、联系方式、上市、开票、进出口、自身风险和关联风险；旧仓库保持不变。

真实关联风险服务比旧快照多出“惩戒名单”维度，已依据真实返回和一手服务实现显式增加字段及测试。产品目录现在为 129 项（含固定企业名称）；旧 128 项元数据原样保留，其他未知目录漂移仍阻断该组填写。风险只输出计数及确定性维度摘要，不做风险定性或跨维求和。来源路径 /projection/ 表明是确定性投影。

运行时按企业、经营、风控工具实际可用性启用对应能力，先精确核验身份，再读取该组字段；缺少工具不影响加载，也不发出该组请求。仅信用代码的表格使用 Provider 声明的备用锚点，核心没有硬编码 QCC 字段名。旧字段名 legal_rep / establish_date / reg_status 作为表头别名兼容。

修复两插件快速切换时偶发的工作台遮挡：通过专属样式标记预留空间，并在实际输入容器重新挂载时重新关联，不改其他插件的内联样式。两个真实宿主各连续三轮切换验证通过，手写草稿和填表任务未串扰。

## 验证结果

| 命令或场景 | 完整结果 |
|---|---|
| npm run check | 96 tests，96 pass / 0 fail / 0 skip；三包 pack、README、内容白名单和凭据检查通过 |
| LEGACY_REPO=../dsh-data-cleaning-agent LEGACY_ADAPT=1 npm run test:consumer | 清洗接入前后各 215 tests 通过，24 原行为 golden；最新旧 Provider 128 目录 + 21 投影 parity；独立 tarball 七组 Provider 与三模板 E2E 全通过，无 workspace 链接 |
| node scripts/configuration-ui-smoke.mjs | 映射/复用/刷新、候选显式选择、恢复选择、网格搜索、取消/retry 指令、Esc、1440/1024/390/900×500 × 深浅色八组布局通过 |
| node scripts/native-ui-smoke.mjs | 原生 React 草稿、导航、输入区布局、恢复和普通会话通过 |
| LEGACY_TARBALL=... node scripts/dsh-native-smoke.mjs | DSH rc.2 和 alpha.2 同装清洗 0.8.8；各三轮切换通过，预览六格及下载恢复通过 |
| FORM_FILL_LIVE_EXTENDED=1 node scripts/dsh-live-e2e.mjs isolated-home bin isolated-port | 两版真实模型调用企业简介与开票字段，分别填写四格，确认副本，二次分析新增 0 |
| node scripts/fidelity-desktop-smoke.mjs | 独立 LibreOffice 26.8 headless profile 打开合成副本、保留 LEN 公式并实际重算：陈旧缓存 999 被正确结果 5 替代 |
| node scripts/performance-smoke.mjs | 5,000 行 / 50,000 格；本机分析 618 ms、全列搜索 528 ms、RSS 348 MiB；不是跨平台性能承诺 |
| npm run demo:web + node scripts/web-smoke.mjs | 最终三模板、实际上传、深浅色、窄屏、下载与来源边界通过，page errors=0 |

完整本地日志：artifacts/alpha9-check.log、artifacts/alpha9-consumer.log（忽略目录，不包含客户数据）。所有 DSH 使用临时或用户已配置的隔离 home；未使用生产 profile、43120，也未保存原始 MCP 响应到仓库。

七组真实工具响应在内存中进入新适配器，以下是各组实际可填写字段数，来自不同公开测试主体，不能相加解释成同一企业结果：

| 工具 | 实际返回并归一化 |
|---|---:|
| get_company_profile | 3 |
| get_contact_info | 5 |
| get_listing_info | 14 |
| get_tax_invoice_info | 8 |
| get_import_export_credit | 10 |
| get_company_risk_scan | 38 |
| get_company_related_risk_scan | 21 |

缺失字段未填。企业域还完成真实 DSH 模型端到端；经营、风控域完成真实工具响应适配及独立 tarball 消费，不将其夸大为已在当前仅连接企业 MCP 的 DSH profile 中运行。

## 仍需外部条件

- npm：已完成最终 alpha.9 三包发布、registry 完整性、README、三模板及双宿主隔离安装验收；中间 alpha.8 不补发。
- 正式用户签收：USER-ACCEPTANCE.md 未代签；本机未安装 Microsoft Excel。LibreOffice 重算证据不冒充 Microsoft Excel 验收。
- 市场：PR #4487 的年龄门禁最早北京时间 2026-09-07 19:09 满足，之后还须维护者审核合并。当前仍未上架。

范围边界：只支持 security.md 列明的 Excel 结构，不承诺任意工作簿；默认每个计划最多 100 次预计工具调用，超出需拆分表格或由调用方明确设置预算。大表性能验证覆盖查看/分析，不代表无上限远端批量查询。后续新增 QCC 工具与目录变更必须继续契约验证，不能自动接受未知字段。

Git/CI：运行代码 e4a17ad7c99be983d3d84c5fe1df5cee448e54c9 已提交、推送，v0.1.0-alpha.9 已推送；[CI 34048662436](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34048662436) 六组全部成功。npm：alpha.9 三包发布及安装验收完成。三包 SHA-256 见 RELEASE-alpha9.md，发布回执见 RELEASE-alpha9-PUBLISHED.md。
