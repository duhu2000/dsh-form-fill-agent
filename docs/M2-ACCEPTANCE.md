# M2 验收与发布状态
更新：2026-09-06。当前版本 0.1.0-alpha.1，预览版本。

## 授权与实现
项目所有者已明确授权真实企查查 MCP 调用、创建 GitHub 远端、push、tag、npm 发布和市场提交；无需再次请求费用或发布批准。
仓库中不保存凭据、真实企业名单或原始 MCP 响应。真实验证通过标准输入在内存中传递返回值。

本轮新增：
- packages/qcc-form-fill-provider/lib/qcc.js：注入式工商 MCP transport、六类字段映射、主体一致性、原值保留、超时与错误分类；index.js 导出。
- packages/dsh-form-fill-agent/lib/task-store.js：磁盘原子快照、0700/0600 权限、进程锁、过期清理、摘要校验及确认产物重建。
- agent 的 workflow.js、http.js、index.js：授权 Provider、任务恢复/删除、form_fill_enrich 高层工具与 Agent-owned 嵌套执行；网页端不直接调用真实 MCP。
- ui.html：真实来源显示、任务恢复链接、查询指令、刷新和删除。
- test/qcc-provider.test.mjs、test/task-store.test.mjs、test/agent-qcc.test.mjs。
- scripts/live-qcc-smoke.mjs：通过标准输入接收真实调用结果，不保存真实验证数据。
- scripts/dsh-smoke.mjs：两版真实 Host 重启后恢复确认任务与下载。
- apps/demo/server.mjs 支持仓库外 FORM_FILL_TASK_DIRECTORY。
- 三个子包发布元数据、README、CHANGELOG、安全与进度文档。根 monorepo 继续 private。

## 已验证结果
- npm run check：46 tests / 46 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo，三包 npm pack 通过。
- 真实 MCP 工商接口可用；初次结构核验成功。实时请求通过工具桥输入 Provider，1 次调用填写 6 格，写回后再次分析新增 0 格，未保存原始返回。
- 真实调用验证范围：本开发环境的 MCP → 注入 transport → Provider → 预览 → XLSX 写回。没有冒充 DSH 中真实模型/OAuth 对话端到端已通过。
- Agent-owned 嵌套执行上下文、只回摘要、旧摘要不能确认新预览：合成测试通过。
- 任务预览/确认结果重启恢复、互斥锁、文件权限、过期和删除：测试通过。
- 旧插件 0.8.6 全量 tarball 消费与 24 golden，以及新三模板消费者：见本轮运行日志。
- 双版隔离 DSH 合成上传/确认/下载、浏览器、重启持久化：见本轮运行日志。

## 发布与待完成项
GitHub 源码和 tag/Release 按授权推进。npm 当前身份验证返回 E401，已发起官方网页登录；需账号持有人完成登录，不能以授权文本替代身份认证。
市场贡献规则要求仓库创建满 1 天。拟提交条目仅描述已实现的 XLSX 填写、企查查工商补全和预览确认，不宣称完整 Word/复杂 Excel/LLM 能力。
真实 DSH 模型驱动 OAuth 对话验收、完整 QCC catalog/bridge parity、简称候选选择 UI、复杂表格和跨平台人工验收仍待后续。当前产品仅完整登记名或代码，可疑主体拒绝自动填写。

市场规则来源：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md
