# 0.1.0-alpha.9

发布日期：2026-09-07。form-fill-core、qcc-form-fill-provider、dsh-form-fill-agent 三包均已发布至 npm，使用 latest 标签。GitHub Release 标题为 0.1.0-alpha.9，已设 Latest，prerelease=false。

## 更新

- 完整原表与结果网格、分页搜索、可恢复单元格选择及映射复用。
- 任务取消、失败部分重试和中断恢复。
- 限定结构的 Excel 公式共存、区域下拉、条件格式与表格对象保真。
- QCC 目录扩展至 129 项，七组扩展工具契约及真实调用验证；缺失工具可降级。
- 清洗插件 0.8.8 最新主线 parity 和双插件切换兼容修复。

## 验证

- 96 项测试、六组 CI 全部通过；运行代码 e4a17ad7c99be983d3d84c5fe1df5cee448e54c9，tag v0.1.0-alpha.9。
- node scripts/registry-smoke.mjs：三包 integrity 3/3、README、三模板 E2E 3/3、独立安装无 workspace 链接全部通过。
- node scripts/dsh-registry-install.mjs：DSH 0.1.1-rc.2 与 0.1.2-alpha.2 的 registry 安装、bundle reconcile、卸载全部通过；临时隔离 DSH_HOME，未使用生产 profile，未打开端口。

完整功能、保真范围及真实调用验证见 U6-ACCEPTANCE.md。正式用户与 Microsoft Excel 验收、市场门禁及维护者审核仍是独立待办，npm 发布不代表市场上架。
