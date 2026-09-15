# 0.2.31 — UX-49 原生首页引导

状态：release candidate。2026-09-15 用户追加授权 commit、push、tag、npm，按规范完成 PR、合并与精确 main CI 后发布。

仅发布 dsh-form-fill-agent 0.2.31；form-fill-core 0.2.10、qcc-form-fill-provider 0.2.2 及其依赖不变。

- 仅入口新建 AI 填表 Session 预填一次原生可编辑引导；异步写入前复查草稿版本、附件、IME 和会话，不抢焦点。
- 用户修改/清空、刷新、重挂载和切回不补写；完全未改的系统模板可由向导替换。
- 明确 Excel、主体定位列、只填空白和生成新文件；缺必要输入先澄清。独立页面不伪造会话输入。
- 保留 UX-48 接纳后开台与 owner/token/TTL、Profile、任务和制品边界。

验证：147 项测试、4 包 pack 门禁；真实隔离 DSH 0.1.2-rc.1 + Better Sidebar 0.18.1 的原生草稿/刷新/清空/A-B、四插件共存、独立页面与原有 3/3 合成模板导出通过。版本准备后重新执行本仓完整门禁；远端要求 Linux/Windows/macOS × Node 22/24 六组通过。

兼容与待验收：附件/IME/晚到竞态已做状态机故障注入；真实中文输入法与附件组合、真实模型不完整模板澄清仍待验收。未调用真实 QCC 或收费 Provider；其他 DSH 版本不由 rc.1 代签。详见 UX49-INITIAL-DRAFT.md。

原开发交付“不发布”状态属于历史记录；本发布授权未扩展至市场修改或生产 Profile 重启。

回滚：在需要回滚的 Profile 执行 `dsh plugin --profile web add dsh-form-fill-agent@0.2.30`；本次不迁移任务数据、不覆盖源文件。旧版本没有首页一次性引导。
