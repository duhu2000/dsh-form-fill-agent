# AI填表 0.1.0-alpha.2 验收

日期：2026-09-06。此版交付任务契约和原生工作台的第一批升级，并提前提供逐格排除。完整 U0–U4 产品范围仍在进行。

## 代码与交互

- 自有前缀 DSH 会话，使用客户端 sessions.create 的 workspaceId 语义；与服务端 cwd 参数区分。仅业务会话显示菜单与提示词入口，普通新会话不复用业务会话。
- 导入、字段规则、主体核验、填写预览、确认下载五步；同一页用于原生右栏与独立网页。历史独立于五步。
- 上传真实文件仅分析，不用 mock 结果冒充查询；合成样例保持 6/4/6 格填写。
- 指令向导居中、正文滚动、底部动作固定。回填原生草稿并聚焦，不自动发送。查询后的任务修订通过轮询反映到工作台。
- 同源 iframe 消息检查 origin、source、当前业务会话和任务格式；关闭再打开工作台恢复该会话当前任务。
- 浏览器生成访问凭据，限制该浏览器任务历史和下载；不是多用户身份认证，也没有完成服务端 workspace/session ACL。
- 任务修改使用 expectedRevision；旧预览确认返回 409。逐格排除后重算 ChangeSet，确认只写剩余格，排除项进入未完成清单。
- schema 2 保存文件名、状态、归属凭据、会话和更新时间；兼容读取 schema 1。进程中断的查询标为 interrupted，异常为 failed。

## 验收

在仓库根目录执行。浏览器命令需设置 PLAYWRIGHT_MODULE 和 CHROME_BIN 为本机安装路径；DSH 命令需设置 DSH_RC_BIN 和 DSH_ALPHA_BIN。

| 命令 | 结果 |
|---|---|
| npm run check | 49 tests：49 pass、0 fail、0 skip；三个 tarball 检查通过 |
| node scripts/native-ui-smoke.mjs | React / Chromium 业务会话、导航、草稿回填、关闭恢复、宽窄屏、普通新会话通过；page errors 0 |
| node scripts/dsh-smoke.mjs | rc.2 / alpha.2 各三套 HTTP + 浏览器闭环、零变更二次填写、重启恢复、卸载组成检查通过 |
| LEGACY_REPO=../dsh-data-cleaning-agent-form-fill-compat-v086 npm run test:consumer | 旧插件 211 tests + 24 golden 通过；独立 tarball 三模板 E2E 3/3，无 workspace 链接 |

浏览器覆盖浅/深色及四组向导视口，真实文件上传、任务历史、来源和下载访问守卫。原生 UI 自动测试使用复刻宿主槽位的真实 React，不能代替真实宿主原生入口和模型对话全链路验收。

core 和 Provider 源码未改变，tarball SHA256 分别为 dda92ed32460d2d669bd8b80f1d3107f6736e2d3f13e37e10ef1240cd379635d、a60c924827819fa1714e37037ef936af3a1609d64c2be85e893414ec92c8e3cb。旧发布主线未修改；0.8.7 共享 core 接入不在已测范围内。

## 演示

本地运行 FORM_FILL_PORT=43262 npm run demo:web，打开 http://127.0.0.1:43262。
导入与识别 → 展开合成模板 → 客户台账 → 勾选预览 → 应用选择 → 确认与下载 → 下载副本/清单。也可上传合成 fixture，先看到零查询的本地分析结果。

DSH 安装后从 AI填表入口创建业务会话，打开工作台导入，生成填写指令并回填草稿。连接企查查后发送指令调用 form_fill_enrich，再回工作台确认结果。真实模型对话全链路仍为下一阶段验收项。

## 限制与后续顺序

1. U2：真实隔离 DSH 原生入口及模型 → QCC → 工作台全流程；完善宿主事件同步与任务归属校验。
2. U3：人工字段映射、候选企业确认、可重新选入的排除项、完整输入/大表分页。当前被排除的格需重新查询或新建任务才能恢复，已有值始终不覆盖。
3. U4：复杂 Excel 保真、完整 Provider catalog/bridge 和更多旧版 parity。
4. 当前工作台会话关联为页面生命周期内缓存；浏览器刷新后用任务历史恢复。未替换宿主默认 Hero 标题，提示词入口导航至已有任务的生成器；尚非完整首页向导。
5. schema 2 写入后 alpha.1 不可直接读取；升级前自行保留本地任务目录副本，回退使用该副本或新建隔离目录，不用旧版覆盖新任务。任务文件与凭据不纳入仓库。

## 发布状态

代码验证通过，准备提交并发布 dsh-form-fill-agent@0.1.0-alpha.2 至 next。form-fill-core 和 qcc-form-fill-provider 保持已发布 alpha.1，不重复发布。
市场草稿 PR #4487 仍受仓库年龄和维护者审核约束；此版不代表市场已上架。
