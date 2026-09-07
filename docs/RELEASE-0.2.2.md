# 0.2.2

右侧工作台增加连续拖拽调宽，匹配 UX-39 与招投标同类交互。支持方向键、Shift 加速、Home/End、双击恢复默认、Escape/失焦取消，展开收起恢复手动宽度。中央会话同步让位，窄屏全屏降级，关闭重开保留本客户端偏好。

主包升级 0.2.2，内核和 Provider 保持 0.2.0；任务 schema 和业务执行不变。

## 验证

- npm run check：98 项测试及三包打包检查。
- 原生 React 隔离浏览器：拖拽、取消、键盘、复位、展开、宽度恢复、宿主左栏占位、窄屏、草稿及任务恢复回归。
- 详细边界见 [工作台调宽验收](WORKBENCH-RESIZE.md)；隔离测试不替代真实宿主用户验收。

## 发布回执

- 代码提交 f340ff1065ecea54cd1e00388693e63ebe553850，V0.2.2 标签已推送。
- [自动发布 34073171720](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34073171720) 成功：六组 CI、三包内容比对、README 和三模板独立安装回归全部通过。
- npm latest 已指向 0.2.2，发布者为 GitHub Actions OIDC；provenance 的仓库、release.yml、V0.2.2、代码提交及工作流运行号全部对应。本次无需浏览器认证。
- GitHub Latest 标题 0.2.2，非 prerelease。
- DSH 0.1.1-rc.2 / 0.1.2-alpha.2 隔离 registry 安装、bundle reconcile、卸载均 PASS；未操作生产 profile，未打开端口。
