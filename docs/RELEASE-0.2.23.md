# 0.2.23

更新 npm 安装说明，按 DSH 宿主版本推荐 Better Sidebar 固定版本：

- DSH 0.1.2-rc.1：Better Sidebar 0.18.1。
- DSH 0.1.1-rc.2：继续使用 Better Sidebar 0.17.1；加载 0.18.1 会缺少 SessionLogOffset 导出而启动失败。

不建议依赖使用无上限的 latest；未来版本可能超出本插件 >=0.17.1 <0.19.0 的兼容范围，或要求更新的宿主。侧栏与主包安装在同一 profile，安装后重启该 profile。

验证：Better Sidebar 0.18.1 实际 service/state 的组件回归通过；隔离真实 DSH 0.1.2-rc.1 + 0.18.1 通过单例 Tab、宿主收起、Tab X 及任务恢复。旧宿主组合的加载错误已复现。测试未改动用户 profile、未调用真实数据接口。

本版更新文档及验收脚本的新版宿主 API 选择和启动错误诊断，运行时代码不变。主包 0.2.23；core 0.2.10、Provider 0.2.2、contracts 0.1.0 不变。
