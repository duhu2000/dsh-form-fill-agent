# 可选侧栏验收（0.2.25 候选）

本轮基于 V0.2.24，遵循共享规范 v1.5.1。只处理可选侧栏，不迁移原生容器，不依赖 alpha 右栏/上传服务，不发布候选。

## 实现边界

- 已有 optional peer 和动态 `ctx.inject(['betterSidebar'])` 保留；主插件必需服务不包含侧栏。运行时继续检查版本、targetedOpen/stateSubscription 和方法能力。
- 基础安装仅安装主包；预检默认 basic，无侧栏给信息提示；workbench 模式缺少侧栏阻断。已安装的已知错误侧栏/context 组合在任何模式下仍阻断。
- 内嵌入口缺失时明确提示并链接已有独立 `/form-fill/?session=…` 页面，原生草稿不清空。没有新建抽屉、overlay 或 details 占用。
- 任务持久化、映射、预览/确认及导出沿用 Host；独立页面使用现有 sessionId/taskId 恢复，不更改业务模型或共享包。

## 无侧栏可用范围

原生业务/普通会话；独立页面上传、字段映射、保存/刷新恢复、预览、确认、导出。`form_fill_enrich` 注册不依赖侧栏，必须由 Agent-owned 工具上下文执行；MCP 查询仍依赖实际授权和服务。

不可用：内嵌 Tab、侧栏导航/布局、独立页面自动回填原生输入框（须复制指令后手动发送）。本轮不宣称真实模型/MCP 已验收。

## 执行上下文审计

本产品没有 `exec.agent.session.events` 或直接用户消息数组读取。保留 `execution.agent` / `execution.token` 检查，嵌套查询沿用 Host 工具管道、parent token、rootCallId 和 agent；不照搬招投标修补，不伪造费用确认来生成草稿。

`scripts/host-tool-probe.mjs` 是隔离测试辅助插件，不在主包 files 中。它创建真实 Host Agent，以合成 user/message 和 Host tools.execute 执行工具，并注册仅返回合成事实的 QCC 工具；没有模型请求、真实 QCC 或生产凭据。

## 证据

- L1：基础/工作台预检、错误配对阻断、缺失能力提示、原有业务测试；`npm run check`。
- L2/L3：最终打包产物经 `scripts/dsh-sidebar-smoke.mjs` 在临时 HOME/DSH_HOME、随机独立端口和 Chrome headless 运行。测试 Node v25.9.0；Node22/24 的跨平台单测由 PR CI 补充。
- 新 DSH 0.1.2-rc.1 无侧栏：`/tmp/ff-optional-new.log`。三套合成 XLSX 6/4/6 格预览/确认/导出、实际上传映射、任务刷新、缺失提示和草稿保护、普通会话通过，pageErrors=0。
- 新 DSH 0.1.2-rc.1 + sidebar0.18.1：`/tmp/ff-optional-sidebar.log`。原有三模板、上传映射、自动草稿回填、单Tab、关闭恢复和普通会话通过，pageErrors=0。
- 旧宿主 0.1.1-rc.2 无侧栏：`/tmp/ff-optional-old.log`，同样三模板、上传映射、草稿与刷新通过（后续仅补独立入口重开恢复）。
- 最终新宿主工具管道及重开恢复：`/tmp/ff-optional-final-tool.log`；最终兼容侧栏：`/tmp/ff-optional-final-sidebar.log`。真实 Agent、真实注册工具管道、合成 user/message 与 QCC 返回，一次查询生成一格预览。
- 最终产物错误配对：`/tmp/ff-optional-final-negative.log`，新旧宿主双向错误配对在 basic/workbench 均阻断；这是发布产物预检策略验收，不再次启动已知损坏的宿主组合。
- L1 124 项测试和四包打包通过：`/tmp/ff-optional-final-check.log`。
- 最终主包：`artifacts/dsh-form-fill-agent-0.2.25.tgz`；SHA256 `d78ba9a8ae0789af9b7bb96053faeb75c8dcda8672176f97b197092542a02971`。

剩余：真实模型与计费 MCP（L4）、四产品一起装载、所有浮窗/底部/深浅窄屏组合未在本轮覆盖。没有修改生产 ~/.dsh、全局宿主或旧Tag。
