# 0.2.22

AI 填表工作台接入 Better Sidebar 的 Session 单例 Tab。五个流程入口打开或聚焦同一 Tab，侧栏展开、收起、宽度和关闭统一交给宿主；移除旧私有侧栏及业务展开/关闭按钮。

需要在同一 DSH profile 安装 Better Sidebar `>=0.17.1 <0.19.0`。运行时核验 targetedOpen/stateSubscription 等能力；缺少依赖显示安装升级提示，不回退旧抽屉。

关闭 Tab 不删除任务，重新打开恢复当前任务、流程阶段及配置未变化时的未应用映射草稿。核心 XLSX 写回保护、查询提供方及原生可编辑草稿机制保持不变。

验证：120 项测试、四包打包检查通过；实际 Sidebar 0.17.1 service/state 的组件浏览器回归通过，覆盖五入口幂等、Files、收起、Tab X、映射恢复、深浅色及窄容器、清理和缺依赖。隔离真实 DSH 0.1.1-rc.2 + Sidebar 0.17.1 通过单例、收起和任务恢复。alpha 环境启动连接失败，不计通过；0.18.x、真实宿主浮窗/底部及多业务插件组合尚未完成验收。未调用真实企查查、未重启用户 DSH。

主包 0.2.22；core 0.2.10、Provider 0.2.2、contracts 0.1.0 不变。详见 SIDEBAR-SESSION-ADOPTION.md。
