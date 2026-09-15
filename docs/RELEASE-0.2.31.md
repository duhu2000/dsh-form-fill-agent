# 0.2.31 — UX-49 原生首页引导

状态：published。2026-09-15 用户追加授权 commit、push、tag、npm，按规范完成 PR、合并与精确 main CI 后发布。

仅发布 dsh-form-fill-agent 0.2.31；form-fill-core 0.2.10、qcc-form-fill-provider 0.2.2 及其依赖不变。

- 仅入口新建 AI 填表 Session 预填一次原生可编辑引导；异步写入前复查草稿版本、附件、IME 和会话，不抢焦点。
- 用户修改/清空、刷新、重挂载和切回不补写；完全未改的系统模板可由向导替换。
- 明确 Excel、主体定位列、只填空白和生成新文件；缺必要输入先澄清。独立页面不伪造会话输入。
- 保留 UX-48 接纳后开台与 owner/token/TTL、Profile、任务和制品边界。

验证：147 项测试、4 包 pack 门禁；真实隔离 DSH 0.1.2-rc.1 + Better Sidebar 0.18.1 的原生草稿/刷新/清空/A-B、四插件共存、独立页面与原有 3/3 合成模板导出通过。版本准备后重新执行本仓完整门禁；远端要求 Linux/Windows/macOS × Node 22/24 六组通过。

兼容与待验收：附件/IME/晚到竞态已做状态机故障注入；真实中文输入法与附件组合、真实模型不完整模板澄清仍待验收。未调用真实 QCC 或收费 Provider；其他 DSH 版本不由 rc.1 代签。详见 UX49-INITIAL-DRAFT.md。

原开发交付“不发布”状态属于历史记录；本发布授权未扩展至市场修改或生产 Profile 重启。

回滚：在需要回滚的 Profile 执行 `dsh plugin --profile web add dsh-form-fill-agent@0.2.30`；本次不迁移任务数据、不覆盖源文件。旧版本没有首页一次性引导。


## 发布回读

- PR #9 已合并；发布提交：`c529b89c1e7ce77437d52bc63a8db7922063c342`。
- PR CI：[34946825200](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34946825200)，六组通过。
- 精确 main CI：[34947464414](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34947464414)，通过。
- Annotated tag `v0.2.31`，tag object `208b0971a2e582c40b7d3e7c56058b0b3e82ea25`，指向上述发布提交。
- [发布工作流 34948138214](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34948138214)：attempt 2 success。首次 npm 已发布，随后 npm 页面 README 传播延迟导致检查失败；待内容同步后幂等重跑，跳过已存在版本并完成 registry 安装/制品核验与 Release。未重发或移动 tag。
- npm version / latest：`0.2.31`；发布者 `GitHub Actions <npm-oidc-no-reply@github.com>`。
- Registry 未返回 gitHead 字段；不伪造。SLSA v1 provenance 的 resolvedDependencies.gitCommit 精确为 `c529b89c1e7ce77437d52bc63a8db7922063c342`，workflow ref 为 `refs/tags/v0.2.31`，workflow path 为 `.github/workflows/release.yml`。
- [GitHub Release](https://github.com/duhu2000/dsh-form-fill-agent/releases/tag/v0.2.31)：正式、非 draft、非 prerelease，2026-09-15T08:48:53Z。
- 结果：发布完成。市场未修改，生产 Profile 未升级或重启；真实业务验收边界仍如上。
