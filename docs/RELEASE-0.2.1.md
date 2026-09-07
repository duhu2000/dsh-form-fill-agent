# 0.2.1

首页输入框外下方快捷入口统一为独立中性描边卡片，上图标下短标签，单行排列；窄屏仅菜单内部横向滚动，不撑宽页面。右侧工作台统一紧凑标题栏、浅灰页面底色、白色内容分区和上传控件；移除重复标题与空任务控制区。

仅主包升级 0.2.1，内核及 Provider 保持 0.2.0，业务执行、字段范围和任务存储 schema 不变。

## 验证

- npm run check：98 pass / 0 fail / 0 skip，打包检查通过；README 更新后重新 pack 检查通过。
- 原生 React 隔离测试：八组首页深浅色/宽度布局、单行卡片、54px 最小高度、位于输入框外、无页面横向溢出；工作台、导航、草稿保护和恢复通过。
- 工作台配置隔离浏览器测试：十组阶段菜单布局、映射复用、候选选择、预览、恢复选择、取消/重试指令通过。
- 界面测试是隔离 harness，不宣称本轮进行了真实模型或生产 DSH 验收；未操作生产 profile 或 43120。

主包 tarball SHA-256：fbd2310e5030bbfefe74862df5ce8cafbf7526de3eedff6a8bd41772ebeb5eb3。

## 发布回执

- 代码提交：d54e69341c9f50f875e2368da9fe7ca69fb0df67；标签：V0.2.1，已推送。
- 六组 CI 全部通过：[运行 34071178806](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34071178806)。
- npm 主包 dsh-form-fill-agent@0.2.1 已发布，使用 latest 标签；内核和 Provider 保持 0.2.0。
- node scripts/registry-smoke.mjs：三包完整性 3/3、合成模板端到端 3/3、registry 与安装后 README、无 workspace 链接独立消费全部 PASS。
- node scripts/dsh-registry-install.mjs：DSH 0.1.1-rc.2 和 0.1.2-alpha.2 的 registry 安装、bundle reconcile、卸载全部 PASS；临时隔离 profile，未打开端口。

正式用户签收和市场上架仍单独跟踪。
