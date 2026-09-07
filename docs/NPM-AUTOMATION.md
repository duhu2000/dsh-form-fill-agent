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

配置状态（2026-09-07）：三个包均已通过 npm CLI 成功创建上述信任关系，首次账号认证已完成。后续默认使用此工作流发布，不再逐包执行本机交互式 npm publish。

无新版本演练 [34072000804](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34072000804) 全部成功：六组 OS/Node 检查、三包构建、registry 下载完整性与包内容比对、README 及三模板独立安装回归通过。此次没有发布新版本，也没有移动已有标签；实际 OIDC 发布与 provenance 留待下一次新版本验收。

## 后续流程

1. 更新有变化的包版本和精确依赖、锁文件、发布说明，提交并推送。
2. 推送与主包版本一致的 V数字版本 标签（兼容小写 v）。
3. 六组检查全部成功后，按 core → Provider → 主包顺序发布新版本。
4. 下载已发布包并核验 registry SHA-512，再逐项对比文件列表和内容（仅忽略 npm 注入的 gitHead）；压缩归档元数据允许跨平台变化，产品内容不同则失败并要求升级版本，不覆盖旧版。
5. registry 独立安装、三模板回归通过后创建数字标题的 GitHub Latest Release。

workflow_dispatch 仅执行检查和 registry 回归，不发布，不创建 Release。用于配置后的无新版本演练。
真正 OIDC 发布能力需在下一次新版本发布时验证 provenance；dry run 不能证明认证成功。

如 npm 部分成功后失败，保留不可变标签，重跑失败工作流；已成功包核验一致后跳过。若需修改包内容，使用新版本和新标签。
