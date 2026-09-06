# AI填表智能体

AI填表将已有 XLSX 中可补全的空白单元格列成预览，使用企查查工商数据补全，并在确认后生成新副本。机器标识：dsh-form-fill-agent；共享内核：form-fill-core。

当前为 0.1.0-alpha.2 预览版本。支持简单 XLSX、确定性同义表头、企业完整登记名、六类工商字段、来源追溯、未完成清单和任务恢复。新版提供五步工作台、指令回填、任务历史与单元格排除。没有 LLM 猜值；已有内容默认保留。

alpha.3 已完成真实宿主修复并提供 GitHub 预览 Release，npm 发布等待账号验证。alpha.2 的客户端清单不可解析，原生入口不加载，独立 /form-fill/ 仍可用。alpha.3 修复此问题及右栏布局、恢复导航、alpha.2 宿主会话隔离；两版真实模型/QCC 闭环通过，见 [原生宿主验收](docs/U2-NATIVE-ACCEPTANCE.md)。npm next 目前仍为 alpha.2。

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

插件清单在 packages/dsh-form-fill-agent/package.json，主仓是 private npm monorepo。智能体版本为 0.1.0-alpha.2，core 和 Provider 保持 0.1.0-alpha.1。使用 next 预览渠道；精确发布状态见 docs/U1-ACCEPTANCE.md，GitHub Release 提供可安装 tarball。

在已选定的 DSH profile 中安装预览版：
```sh
dsh plugin --profile web add dsh-form-fill-agent@0.1.0-alpha.2
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

公式、宏、图片、数据验证、条件格式等复杂结构目前明确拒绝；Word、复杂布局和完整 QCC 字段目录尚未实现。见 [文件支持和安全边界](docs/security.md)。
