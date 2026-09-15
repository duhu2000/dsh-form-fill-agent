# UX49-FORM：原生首页初始引导（Unreleased）

采用 DSH-UX-001 v1.5.6，UX-49、§11.1、§14；核对并保留 UX-48。
权威材料为公共 AI-设计目录中的《DSH智能体开发交互规范方案.md》《DSH-UX-049-四智能体首页初始引导协同.md》，以及 2026-09-15 总账交接单。本文件仅记录本仓采用，不复制规范。

## 审计与范围

- 2026-09-15 远端 main：`ff6228818580408befb3186402346ba16bb5e59e`，tree `1d83c16b2550cd33cf587859ee225bff163f892e`；npm latest `0.2.30`。
- 原仓 `feat/history-progress-028` 有 client.js 与 sidebar-adapter 测试未提交修改，完整保留；本次使用独立 `feat/ux49-initial-draft` 工作树。
- 在途 PR #2–#5 为既有历史分支，不修改或关闭；本次单独 PR。仅主包运行时代码与本仓测试/采用文档；共享包、owner/token/TTL、Profile 存储、任务/制品逻辑不变。
- 本次授权截止 commit、push、PR 和 CI；无版本升级、合并、tag、GitHub Release 或 npm publish。

## 原生接口和资格

仅入口 `sessions.create({workspaceId,sessionId})` 返回自己创建的命名空间 ID 后 arm，再打开该 Session。普通会话、其他产品和恢复的旧会话没有 arm 资格。

使用实际安装 DSH 0.1.2-rc.1 的 `dsh-client-ui-conversation` 发布类型/运行时代码：`conversation.input.shell(id)`、`state.getSnapshot()/subscribe()`、`draft`、`draftRev`、`imageIds`、`occurrences`、`phase`、`setDraft(text)`；shell 的 Lexical editor 提供 `getRootElement()`、`isComposing()`、`update()`。

`getRootElement` 仅判断挂载，不读取 DOM 文本。写入在 editor 的 discrete update 内使用 `skip-dom-selection` tag，再调用公开 `setDraft`，防止 Host 默认 selectEnd 抢焦点。没有 DOM value 写入、输入框替身或全局发送拦截。缺任何必需能力时保守跳过。

状态从 unseen 到 initialized/skipped。原生输入挂载最多等 20×50ms；任意草稿 revision 变化（包括输入后清空）、附件、IME、Session 离开均使资格失效。异步等待结束后再次读取完整快照，再同步写入；不能用过期的空值判断写入。

标记位于本浏览器 `sessionStorage`，key 为模板 ID + Session ID，值只含状态、模板 ID、系统模板精确正文指纹、untouched 标记，不保存用户文本。刷新/HMR 后不创建资格，因此不会补回；存储不可用也跳过。卸载清理订阅与待初始化资格，不删除任务/历史。

## 文案与精确识别

模板 ID / 版本：`dsh-initial-draft/form-fill/1`。指纹采用原始全文严格相等，不做 trim、模糊比较或归一化。正文：

> 请帮我填写企业信息表。请上传 Excel 模板，说明主体定位列和需要填写的字段；也可点击左上角「提示词生成」设置填写规则。例如：按“企业名称”定位，只填空白单元格，补充统一社会信用代码、法定代表人和注册地址，并生成新文件。

只有当前初始化记录仍 untouched、revision 未改变且正文完全相同，向导才可排除该模板。用户改动、清空或改后恢复原文均按用户草稿处理；刷新后采取保守的普通草稿冲突确认，不因文本相同自动替换。

仅 AI 填表 Agent Session 获得 `systemPrompt.section` 的业务澄清规则。直接发送引导、未补全【】或缺 Excel/主体定位信息先澄清，不创建任务、不调用业务工具；已有真实任务可沿用已保存映射。其他 Session 与诊断组装返回空规则。工具描述也要求真实上传任务和定位列；既有 enrich 服务仍执行 owner/Session/任务校验。

这是 Agent 业务指令，不是全局发送阻断。引导阶段零发送、零任务、零 Provider。用户真实提交后继续沿用 UX-48 Host observed admission 开台；不把初始文本当上传文件、字段识别或查询授权。

独立 `/form-fill/` 不初始化原生草稿，不增加伪造输入框；主工作簿/次要报告边界不变。

## 验证记录

- 本仓 `npm run check`：147 项测试与 4 包 pack 门禁通过。主包新增约 5KB 草稿保护代码，未压缩体积 201309 bytes；仅主包 pack 上限从 200000 调整至 210000，其他包上限及白名单保持。
- 新测试覆盖文字/空白字符、附件、引用、提交态、IME、晚到文字/附件/清空、A→普通→A 竞态、初次挂载、未挂载过期、旧会话、跨产品、卸载和刷新标记；严格指纹及修改后恢复原文不误排除。
- UX-48 既有接纳/失败/重复/跨 Session/解绑测试通过。
- 真实 DSH 0.1.2-rc.1 + Better Sidebar 0.18.1，临时 HOME/Profile、随机端口、Chrome：首入可编辑正文、焦点不变、修改刷新、键盘清空刷新、A/B、普通会话、独立页面无伪输入通过。注意：清空使用真实键盘，并等待宿主持久化；不把 Playwright contenteditable.fill('') 的投影延迟误记为业务恢复。
- 四插件同装：数据清洗 0.9.15、访前尽调 0.1.35、招投标 0.5.11、本地填表候选包。入口分别为 button / button / button（名称“新建招投标会话”）/ link（名称“AI 填表”）；互切与用户草稿隔离通过。
- 原有真实 DSH 工作流回归通过：单例 Tab、折叠/关闭恢复、3/3 合成模板预览确认导出、上传映射、原生草稿回填与普通会话隔离；浏览器错误 0。同步修正测试中的旧 Tab 标题空格定位。
- 回归命令：`UX49_PROBE=1 UX49_FOUR=1 DSH_RC_BIN=<rc.1 bin> PLAYWRIGHT_MODULE=<playwright> CHROME_BIN=<Chrome> SIDEBAR_VERSION=0.18.1 FORM_FILL_SCREENSHOTS=<evidence directory> node scripts/dsh-sidebar-smoke.mjs`。测试只在临时安装副本插入只读快照/焦点探针，不修改生产安装。
- 真实运行证据在交付目录 `ux49-form-evidence` 的 native/standalone PNG 与运行日志。没有发送或业务请求，未调用真实 QCC。

## 兼容边界 / 待验收

附件/IME/晚到竞态是本仓状态机故障注入覆盖；真实 DSH 的附件上传与中文输入法逐项组合仍需人工验收。直接发送不完整模板时的澄清已通过业务规则隔离契约，未使用真实模型发起收费对话验证模型遵循率，不能把指令测试当作真实模型零工具证明。DSH rc.2/alpha/其他发布版不由本轮 rc.1 测试代签；输入能力不足时跳过初始草稿。生产 Profile 未修改、未重启。
