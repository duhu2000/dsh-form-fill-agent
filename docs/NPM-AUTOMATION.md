# npm 自动发布

采用招投标智能体的 GitHub Actions OIDC 可信发布方式，无需存储长期 npm Token。

## 一次性 npm 信任配置

三个 npm 包分别配置 GitHub Actions Trusted Publisher：

- 包：form-fill-core、qcc-form-fill-provider、dsh-form-fill-agent。
- GitHub owner：duhu2000。
- Repository：dsh-form-fill-agent。
- Workflow filename：release.yml。
- Environment：留空。
- 允许直接 publish。

配置状态：工作流已实现，npm 端信任关系尚待账号认证后核验或创建。不能将工作流准备完成等同于 OIDC 发布已验收。

## 后续流程

1. 更新有变化的包版本和精确依赖、锁文件、发布说明，提交并推送。
2. 推送与主包版本一致的 V数字版本 标签（兼容小写 v）。
3. 六组检查全部成功后，按 core → Provider → 主包顺序发布新版本。
4. 已存在版本必须与本次 tarball 完整性一致，否则失败并要求升级版本；不覆盖旧版。
5. registry 独立安装、三模板回归通过后创建数字标题的 GitHub Latest Release。

workflow_dispatch 仅执行检查和 registry 回归，不发布，不创建 Release。用于配置后的无新版本演练。
真正 OIDC 发布能力需在下一次新版本发布时验证 provenance；dry run 不能证明认证成功。

如 npm 部分成功后失败，保留不可变标签，重跑失败工作流；已成功包核验一致后跳过。若需修改包内容，使用新版本和新标签。
