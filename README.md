# AI填表智能体

## 安装与三分钟上手

AI填表智能体：支持自动填表、表格填充、表格补全、Excel填表与 Excel回填；使用企查查 MCP 填写 XLSX 空白字段，预览确认后导出新副本。

```sh
dsh plugin --profile web add dsh-form-fill-agent@0.2.14
```

请先满足下文的 DSH、连接器及侧边栏依赖要求；安装后完整停止并重启对应 Profile。

打开“AI填表”并展开合成演示，选择客户台账模板，检查工作表、企业主体和空白字段。需要真实补全时确认数据来源及范围并手动发送指令；核对单元格预览后下载新 XLSX 副本。

**流程样例（示意，非真实调用结果）：** 合成客户台账的空白字段 → 字段映射和主体核验 → 单元格级事实/来源预览 → 人工确认 → 新 XLSX 与变更清单。

**能力边界：** 仅支持当前文件安全规则允许的 XLSX；不支持 Word、宏、图片和复杂布局。默认只填空白，不用模型猜值；查询使用用户已授权 MCP 账号额度。

**升级与回滚：** 升级前停止 Profile 并备份任务目录，记录当前精确版本；使用上面的固定版本命令升级，再完整重启。回滚时将版本号替换为升级前记录的版本，并使用升级前任务目录副本；不以旧版直接读取已迁移任务目录。

相关智能体：[数据清洗补全](https://github.com/duhu2000/dsh-data-cleaning-agent) · [AI填表](https://github.com/duhu2000/dsh-form-fill-agent) · [访前尽调](https://github.com/duhu2000/dsh-pre-duediligence) · [招投标](https://github.com/duhu2000/dsh-tender-workbench)


AI填表将已有 XLSX 中可补全的空白单元格列成预览，使用企查查工商数据补全，并在确认后生成新副本。机器标识：dsh-form-fill-agent；共享内核：form-fill-core。

当前正式编号版本为 **0.2.14**，包含完整网格、恢复选择、取消/重试、133 字段目录、受限 Excel 保真及企查查蓝工作台。新增与清洗补全共享的实际控制人四字段，默认只填空白，来源可追溯，支持任务历史和中断恢复；不使用 LLM 猜值。发布记录见 [0.2.14](docs/RELEASE-0.2.14.md)，正式用户签收与市场上架状态见 [当前进度](docs/PROGRESS.md)。

alpha.4 修复 npm README 缺失。alpha.5 的 59 项测试、六组 CI、双宿主真实模型/QCC 闭环，以及发布后 README/完整性/安装回归全部通过，进展和边界见 [U3 验收](docs/U3-CONTROLS-ACCEPTANCE.md)。产品仍处于 alpha 阶段，请使用 latest 或精确版本；next 是此前的旧预览渠道。

## 本地体验

Node 22 或 24：
```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run demo:web
```

打开 http://127.0.0.1:43260 ，选择客户台账、供应商准入表或合同主体信息表。三套模板完全合成，不发起真实调用。

独立 Web 默认内存存储；设置 FORM_FILL_TASK_DIRECTORY 为仓库外专用绝对目录可启用磁盘存储，目录须仅当前用户可读写。独立 Web 任务默认保留 15 分钟。

## DSH 使用流程

插件清单在 packages/dsh-form-fill-agent/package.json，主仓是 private npm monorepo。主包 0.2.14 精确依赖内核 0.2.9 及 Provider 0.2.1，Provider 依赖共享字段契约 0.1.0；推荐使用 latest 渠道。

在已选定的 DSH profile 中安装预览版：
```sh
dsh plugin --profile web add dsh-form-fill-agent@latest
```

安装三个 tarball 至隔离 profile 后，将 dsh-form-fill-agent 加入该 profile 的 bundles。两版真实安装与卸载演示可运行 scripts/dsh-smoke.mjs，环境配置见 docs/M1-ACCEPTANCE.md。不要把测试安装到生产 profile，测试禁止使用 43120。

1. 打开 DSH 同源路径 /form-fill/（可选原生侧栏入口缺失时直接访问）。
2. 上传简单 XLSX。首次仅做本地分析，不发起企查查调用；体验合成模板需单独展开。
3. 需要真实数据时，从主体核验页生成指令，回填原生草稿或复制到 DSH 对话。Agent 调用 form_fill_enrich，嵌套调用已连接的企查查企业工商 MCP。
4. 工作台自动刷新；查看各格准备填写的事实值、来源和未完成项，可排除单元格后应用选择。
5. 确认填写，下载新 XLSX、变更清单和未完成项。保留页面地址可恢复任务，也可手动删除。

需要在 DSH 中已连接并授权企查查企业数据 MCP。本插件不读取或保存 OAuth/Token。真实查询使用用户 MCP 账号的积分；开发者的成本安排不等于所有最终用户免费。
只支持完整登记名称或 18 位信用代码；简称、主体不一致、多候选不会自动选择，须人工核验后修改输入。

DSH 在显式 DSH_HOME 下保存任务至 form-fill-tasks，默认 24 小时过期；没有 DSH_HOME 时降级内存。确认结果可在重启后重新生成下载，无须重复调用企查查。文件权限 0700/0600，原始 MCP 响应不持久化；保留输入文件和归一化预览，删除任务会删除保存文件。

## 验证与边界

- [原生宿主及真实模型验收](docs/U2-NATIVE-ACCEPTANCE.md)：双基线闭环通过。[此前 U1 范围](docs/U1-ACCEPTANCE.md)保留历史记录；升级 schema 2 后回退 alpha.1 需使用升级前任务目录副本或新目录。

- [整体进度](docs/PROGRESS.md)、[M1 验收](docs/M1-ACCEPTANCE.md)、[M2 验收与发布状态](docs/M2-ACCEPTANCE.md)。
- npm run test:consumer：旧插件完整检查、24 golden case，以及新插件三个真实 tarball 消费闭环；需要相邻兼容工作树。
- node scripts/registry-smoke.mjs：从官方 npm 安装，核验三个 tarball 完整性及三模板端到端结果。
- 新增 QCC 契约、Agent-owned 嵌套执行、任务重启恢复、权限和过期测试。
- 三包分别为 packages/form-fill-core、packages/qcc-form-fill-provider、packages/dsh-form-fill-agent。
- 旧插件主线未改动，共享 CSV 接入只在独立兼容工作树验证。

普通内部公式、固定区域下拉、基础条件格式和普通表格对象已受限支持；宏、图片、动态区域及扩展结构继续拒绝；Word 和复杂布局尚未实现；既有 128 字段目录已迁移，并适配 1 个新增关联风险维度。见 [文件支持和安全边界](docs/security.md)。
