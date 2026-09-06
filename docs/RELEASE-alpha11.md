# 0.1.0-alpha.11

工作台阶段菜单按最新共享交互规范统一为五项等宽分栏：导入表格、字段设置、主体核验、填写预览、确认下载。上方线性图标、下方单行短标题；选中项浅蓝底、蓝字和底部蓝线。说明保留在正文，窄屏自动缩小图标与字号并省略溢出文字。

仅主包升级 alpha.11；内核保持 alpha.10，Provider 保持 alpha.9。

## 本地验收

- npm run check：98 pass / 0 fail / 0 skip，三包打包、README 和白名单检查通过。
- configuration-ui-smoke：320/390/480/640/900px × 深浅色十组菜单布局通过；五项等宽、同一行、上图标下标题、无横向溢出。
- 字段映射/复用、候选选择、预览、恢复选择、取消和重试指令等既有交互回归通过。
- 测试使用临时随机端口和合成数据，未使用生产 DSH profile 或 43120。

主包 tarball SHA-256：5fc70c2824698e948102098613b947254bc932d3cc00faa13a690c265c9e3363。

## 发布回执（2026-09-07）

- 主包 alpha.11 已发布 npm；内核 alpha.10、Provider alpha.9 保持不变。
- 已核验 npm latest=0.1.0-alpha.11；GitHub Latest 标题为 0.1.0-alpha.11，prerelease=false。
- 运行代码 ec5d7cba0c5ebd359f1978417833bcf88591af8d；tag v0.1.0-alpha.11 已推送；CI 34067187227 六组全部成功。
- node scripts/registry-smoke.mjs：三包完整性、README、三模板 E2E 3/3 和独立安装无 workspace 链接全部通过。
- node scripts/dsh-registry-install.mjs：DSH 0.1.1-rc.2 与 0.1.2-alpha.2 的 registry 安装、bundle reconcile 和卸载全部通过；临时隔离 home，未使用生产 profile，未打开端口。
