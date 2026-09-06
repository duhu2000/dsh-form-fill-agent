# 0.1.0-alpha.7 侧栏对齐修复

移除 AI填表侧栏入口外层多余的 10px 左边距，将按钮左边距从 12px 调整为 8px，图标文字间距从 10px 调整为 8px，与相邻菜单对齐。

仅主包版本升级；core / Provider 仍为 alpha.5。查询、填写和任务存储逻辑不变。

- 代码提交：22330e5；已 commit / push，v0.1.0-alpha.7 已推送。
- npm run check：60/60 tests、三包打包白名单与 README 检查通过。
- scripts/native-ui-smoke.mjs：修复后原生 React UI 交互回归通过。
- CI 34044054999：Windows / macOS / Linux × Node 22/24，6/6 成功。
- 本次仅样式调整，未重复真实 QCC 调用；alpha.6 的真实链路验收属于前版证据。
- npm alpha.7 已发布，latest=0.1.0-alpha.7；next 保留旧 alpha.3。
- GitHub Release 标题为 0.1.0-alpha.7，非 Pre-release，已设为 Latest。
- 发布后 registry README 与安装包一致；三包 integrity 3/3、三模板 E2E 3/3，无 workspace 链接。
