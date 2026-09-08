# AI 填表：通用映射适配验收（未发布）

日期：2026-09-08。基于 AI 填表 0.2.14 / b25661b，在隔离工作树 `/tmp/ff-auto-013` 实现。
参考清洗 v0.8.16 / `33e57adc80c13d17b1a6ed6de0cfa776467383cc`，未 cherry-pick 或修改清洗源仓库。

## 差异与实施结果

1. 原 UI 缺少明确状态且保存会把未操作字段记为人工选择。现在分别显示自动通过（绿）、待人工确认（琥珀）、已确认（绿）、未匹配（红）、已跳过（中性）。未操作字段保留自动证据；地址推荐需确认。颜色仅表示映射状态。
2. 原内核一律阻止重复目标。现在重复非主体位置经逐一确认后可共用字段；按 sheet/column/cell 保留独立位置与选择。重复自动候选仍阻断。
3. 映射增加可选 `role: input | output`，用于区分定位列和仅接收填写的企业名称/信用代码位置。表结构在使用 role 时返回 `anchorColumns`。同一定位字段不能有两个输入列；同名企业携带不同信用代码时阻断按名称共用查询，需明确信用代码定位。
4. 范围由当前映射去重生成；角色和证据纳入草稿签名。删除映射不抹掉同字段的其他位置。修复跨任务修订号相同导致恢复旧任务的问题。
5. HTTP 返回 `mappingProtocol: 2`；页面在回填前协商 `ff-capabilities` / `mappingDraft: 2`。缺失或不兼容时显示中文提示，不回填执行草稿。Host 保留可编辑草稿及原有发送机制，没有新增费用布尔值，也不在生成草稿时查询。
6. 固定模板不新增列；保留非空、数值 0、布尔 false、公式（包括返回空字符串）、样式及既有合并/隐藏保护。公式存在时原有写出机制会设置重新计算标记，这不属于字节完全不变的工作簿元数据。

## 修改文件

- `packages/form-fill-core/lib/index.js`：重复位置确认、定位与输出分离、同名标识冲突保护。
- `packages/dsh-form-fill-agent/lib/ui.html`：状态、角色、确认来源、范围、恢复、草稿协商与位置说明。
- `packages/dsh-form-fill-agent/lib/brand.css`：深浅色映射状态与窄屏样式。
- `packages/dsh-form-fill-agent/lib/client.js`：原生 Host 草稿能力响应。
- `packages/dsh-form-fill-agent/lib/http.js`：服务协议能力标记。
- `packages/dsh-form-fill-agent/lib/workflow.js`：允许明确输出角色的主体字段进入填写范围。
- `test/mapping-positions.test.mjs`：合成 XLSX、重复位置、去重、公式/原值/标识保护。
- `test/http.test.mjs`：独立取消、恢复、确认及 owner 隔离。
- `test/task-store.test.mjs`：角色、重复映射与范围重启恢复。
- `scripts/mapping-ui-regression.mjs`：本轮状态、重复确认、跳过、刷新、删除映射、旧/新 Host 回归。
- `scripts/configuration-ui-smoke.mjs`：更新待确认语义和等待目标任务的条件。
- `scripts/consumer-contract.mjs`：最新清洗解析器保持原样，验证 tarball 共存。
- 本验收文档。

## 执行命令与结果

在本工作树执行：

```sh
npm run check

export PLAYWRIGHT_MODULE=/Users/qcc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node scripts/mapping-ui-regression.mjs
node scripts/configuration-ui-smoke.mjs
node scripts/native-ui-smoke.mjs

LEGACY_REPO='/Users/qcc/Documents/DuHu/QCC/beichacha_doc/云聚接口/MCP/MCP/workspace/dsh-data-cleaning-agent' LEGACY_ADAPT=1 npm run test:consumer
git diff --check
```

- 本侧 `check`：111 项测试通过，0 失败/跳过；4 个 npm pack 检查通过。
- 映射浏览器：浅/深色 × 320、390、640、1024、1440，共 10 组布局/状态检查通过；人工确认、键盘 Enter/Escape、刷新恢复、删除单个映射、旧 Host 无草稿及新 Host 正常草稿通过。
- 完整配置浏览器：七列范围修复、六格导出、缺失主体阻断、未纳入确认、搜索/推荐、持久化、取消/重试及响应布局通过。
- 原生 React 合约 harness：会话入口、草稿、任务恢复、可调面板、普通新会话通过。它不是生产 DSH 或真实模型端到端。
- 清洗 v0.8.16 安装 tarball 前 233 项、安装后 234 项检查通过（后者额外加载了验收脚本复制的 golden helper）；24 个行为 golden、128 项目录与 21 项投影 golden 一致。
- 独立目录消费真实 tarball：3/3 XLSX 端到端、7 组 Provider、控制人共享包通过；没有 workspace 符号链接，没有 npm 发布。

日志：`/tmp/ff-mapping-check.log`、`/tmp/ff-mapping-new-ui.log`、`/tmp/ff-mapping-ui.log`、`/tmp/ff-mapping-native.log`、`/tmp/ff-mapping-consumer.log`。
截图：`/tmp/ff-mapping-states-{light,dark}-{320,390,640,1024,1440}.png`。仅合成数据，不提交客户工作簿或真实响应。

## 复用边界与版本建议

共享内核有代码变更，建议后续发布 `form-fill-core 0.2.10`、主包 `dsh-form-fill-agent 0.2.15` 并更新依赖。当前版本号保持基线，所有新代码未发布。
Provider 和 `qcc-field-contracts 0.1.0` 无代码/版本变更。没有迁移清洗专属路由、投影模型或额外导出字段 UI。

最初旧消费者脚本强行替换清洗 CSV 解析器时有 2 项失败：历史 `legacy-csv` 尚不支持 v0.8.16 的重复表头保护。因此本次仅证明新包安装共存、表单消费和旧行为不变，**不声称历史 CSV 解析器可替代清洗最新解析器**。未来迁移需另立契约，不在本轮扩写该历史 API。

## 未完成与限制

- 未发布 npm、未更新市场 PR、未安装或重启本机 DSH；市场审核状态保持原样。
- 未进行真实模型/QCC 端到端或 Microsoft Excel 桌面验收；此轮使用合成数据、mock Provider 与隔离浏览器服务器。
- 仅支持现有表格模型内的重复输出位置，不扩展任意自由布局表单、未知字段或新 Excel 结构。
- 无法从名称本身推断两条完全相同文本是否为不同企业；有冲突标识则阻断，缺乏依据仍需用户核验。
- 老版本不理解新 role 语义；后续发布需让 UI、Host、内核一起升级。回退前保留任务副本，不能用旧版编辑新角色配置。
