# AI 填表统一侧栏适配（0.2.22）

## 0.2.23 安装组合补充

2026-09-10：Better Sidebar 0.18.1 实际 service/state 组件回归及隔离真实 DSH 0.1.2-rc.1 交互回归通过。推荐此固定组合；DSH 0.1.1-rc.2 保留 Sidebar 0.17.1，加载 0.18.1 已复现 SessionLogOffset 导出缺失。以下 0.2.22 验收记录保留为历史事实，0.18.1 的未验收项由本补充更新；浮窗/底部及多插件组合仍不声明通过。

分支：`feat/sidebar-session-v1.5.0`；基线：`157976ffc5502fde7cd3dde2fe947b528cfcbf95`。
后续用户已授权发布：主包升级 0.2.22，发布分支 release/0.2.22；核心与提供方版本不变。市场不在本次修改范围。

## 契约与实现

依照统一交互规范 v1.5.0 第 7、13.4–13.6、14、15、15.1 节及同版 Mockup：

- Better Sidebar 管理 Session 容器和 Tab。业务 Tab 类型为 `dsh-form-fill-agent:workbench`，单例且隐藏于通用新增列表。
- 五个快捷入口只打开或聚焦该 Session 的同一 Tab 并导航，不创建填写任务、不执行查询。
- 删除业务固定侧栏、展开/关闭按钮、拖动宽度及会话 padding 调整。
- 可选 peer 范围 `dsh-better-sidebar >=0.17.1 <0.19.0`；运行时同时检查版本、targetedOpen、stateSubscription 及所需方法。缺依赖给出安装升级说明，不回退旧抽屉。
- 隐藏 Session 的导航延后至激活和挂载后揭示，不调整另一 Session 的布局。右侧/底部揭示沿用宿主布局，浮窗位置不改动。
- Tab X 不删除任务。重开恢复任务与阶段；未应用的映射草稿按配置签名存于 sessionStorage，服务端配置变化后不恢复过期草稿。
- 清理订阅、观察器和自有 Tab；不关闭 Files、不删除任务、不取消执行。
- XLSX 页面、原生可编辑草稿及冲突追加/替换机制沿用原实现。未修改 FillPlan、ChangeSet、写回保护和查询提供方；不声明 Word 支持。

## 验证

- `npm run check`：120 项测试通过，四包打包检查通过。
- `test/sidebar-adapter.test.mjs`：能力缺失、兼容版本、Session 隔离、右侧/底部/浮窗揭示、清理。
- `scripts/sidebar-ui-smoke.mjs`：实际 Better Sidebar 0.17.1 service/state + React + 实际业务 HTTP 页，外围宿主为合成实现。覆盖单例、五入口幂等、Files 切换、收起、Tab X、映射草稿恢复、深浅色 × 320/640/900 容器宽度、卸载和缺依赖。
- `scripts/dsh-sidebar-smoke.mjs`：隔离真实 DSH 0.1.1-rc.2 + Better Sidebar 0.17.1 通过单例、收起、Tab X 和任务恢复。临时 profile、随机端口、合成 XLSX；未调用真实数据工具。
- alpha 环境测试在启动阶段连接失败，未计入通过。尚未验收 0.18.x、真实宿主底部/浮窗、与其他业务插件联合安装及真实模型/提供方执行。

运行浏览器脚本需设置 `PLAYWRIGHT_MODULE`、`CHROME_BIN`；组件脚本另需 `SIDEBAR_SOURCE` 指向带 src 的 Better Sidebar 安装目录，宿主脚本需 `DSH_RC_BIN` 或 `DSH_ALPHA_BIN`。宿主脚本先使用 `npm run check` 生成的本地 tarball。

旧 `native-ui-smoke.mjs` 和 `dsh-native-smoke.mjs` 是发布 0.2.21 私有面板的历史回归脚本，包含旧容器断言；本分支容器验收使用上述新脚本。原有业务测试继续由 npm test 与独立业务 UI 脚本覆盖。

## 后续组合验收

在依赖 0.17.1/0.18.x 与支持的 DSH 版本组合中补验：多业务 Tab + Files、宿主底部/浮窗、多 Session、插件重新加载、完整模型执行与导出。通过前不把组件测试等同全链路验收。
