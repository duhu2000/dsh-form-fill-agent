# 兼容基线与并发工作记录

## 当前基线（2026-09-07）

清洗插件 0.8.8 / 6cea1667483ccacf410b5a577b27f1be29267f40，原仓库保持干净。alpha.8 core 的真实 npm tarball 在临时消费者中接入 parseCsv：接入前后各 215 tests，全量 lint/docs/marketing/pack 检查和 24 个 golden 全通过；三个填表模板独立消费者 E2E 通过。未修改旧插件发布源码、工具名、路由、任务、制品或目录。

两版 DSH（0.1.1-rc.2 / 0.1.2-alpha.2）全新临时 home 同装清洗 0.8.8 与填表 alpha.8，通过入口/品牌切换、合成清洗名单、手写草稿保留、填表六格预览/下载/恢复及普通会话隔离。会话切换探针只注入临时安装副本并调用真实 SDK，发布 tarball 不带探针。

清洗 0.8.8 明确在离开后释放业务所有权；返回原会话保留手写草稿，但不自动重挂清洗首页，点击清洗入口会创建新业务会话。这是该版本自身契约，测试不冒充它支持跨会话自动恢复工作台。填表按自己的 sessionId 恢复任务。

共享 Provider 当前扩展工商 26 字段，并非旧 128 字段完整迁移。非工商 catalog/bridge 需独立批次 golden/parity 和工具契约，不能由 parseCsv parity 外推。

以下为移交与早期版本的历史证据；旧版本结论不代表当前状态。

接手时只读核验：main 与 origin/main 对齐于 ee8dafb；v0.8.2 为附注 tag，其解引用 commit 同为 ee8dafb；package 0.8.2。lib/client.js 用户补丁将 workspaceId 改为 cwd。初始 npm run check：202 项，200 pass / 2 fail。

保留用户补丁，补上测试 fixture.path 并将断言改为 cwd、不传 workspaceId，恢复 202/202。随后先生成 24 个旧行为 golden case，再抽取 parseCsv。

## cwd 语义证据

scripts/check-session-baselines.mjs 位于旧仓库，执行两条已安装 SDK 中真实方法体，边界依赖用合成 seam 替代，不开启生产 profile：

| 项目 | rc.2 / 0.1.1-rc.2 | alpha.2 / 0.1.2-alpha.2 |
|---|---|---|
| cwd 和调用方 sessionId 保留 | PASS | PASS |
| 只传 cwd 不调用工作区 attachSession | PASS | PASS |
| 新建会话仍为 blank | PASS | PASS |
| 未附加的 blank 不被 connectWorkspace 复用 | PASS | PASS |
| workspaceId 创建附加到工作区并可被 blank 复用 | PASS | PASS |
| 同时传 cwd/workspaceId | Client 选择 workspaceId 分支 | Host 明确拒绝混传 |

rc.2 Host SHA256：8e32ffc951f499849c155e30cb30813af5ed7abb11008653125092299b693d9f。
alpha.2 Host SHA256：a28fa9a5ffad5d2e7af427c0410e973a5e14a36bc070eecf8735b77b95a17cea。

此证据是实际 SDK 方法级执行，不冒充真实会话持久化端到端。另已通过两版真实隔离 DSH Host 的 tarball 加载、health 和移除 bundle 后配置恢复验证；无 companion plugin。

## 并发变化与隔离

开发过程中另一个进程将 cwd 修复、修正后的入口测试及本任务新增的 golden/探针文件提交为 faf09eb，package 升为 0.8.3。本任务未执行该 commit、push 或 tag。为不污染并行发布，本任务将两个内核接入改动从主目录移入独立 detached 工作树 dsh-data-cleaning-agent-form-fill-compat，固定 faf09eb。

2026-09-06 后续只读复核发现主目录已前进至 dea5959 / 0.8.6，main 与 origin/main 对齐，工作树干净。本任务不回退或覆盖该变化。新增 detached 工作树 dsh-data-cleaning-agent-form-fill-compat-v086，只应用下述两个接入改动。实际 tarball 消费完整 check 211/211，24 个 golden case 通过；faf09eb / 0.8.3 兼容工作树继续保留。

0.8.5（676a366）由并行任务恢复 workspaceId 创建，并增加限定作用域的 New Session Bridge：原生输入区需要工作区 sessionIds，cwd-only 方法测试通过不代表原生输入交互可用。这补充了最初探针的证据边界，不撤销原始用户修改的保留与审计记录。当时 AI填表入口仅为独立工作台。alpha.2 起已改为明确创建独立原生业务会话，不复用普通空白会话。

兼容工作树只将 lib/engine.js 的 parseCsv 改为 core 子路径导出、package.json 加入本地 tarball 依赖。24 个 golden 的语义，以及工具/路由/任务/制品/字段目录源码指纹全部保持一致。默认发布主线尚未合入 core。

Node 22.19.0 和 24.19.0 已在 macOS 验证；当时 Windows/Linux 仅有 CI 草案；后续发布已运行三系统 × Node 22/24，当前提交结果见 U5-ACCEPTANCE.md。DSH rc.2 和 alpha.2 均通过全新隔离 Host 中的三套表格上传/确认/下载/二次零变更及浏览器验收；这不代表 alpha 的所有宿主能力均获得支持。完整真实 QCC Bridge 及 128 字段目录尚未迁移，新 mock Provider 不能等同于旧 Provider 已完成 parity。
