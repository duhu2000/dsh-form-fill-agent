# AI 填表宿主升级兼容审计（0.2.24）

基线为 release/0.2.23（0829ad5）。当前 npm 仍为 0.2.23；本轮没有发布、打标签或更改主分支。只修改 AI 填表仓库。

## 审计结论

客户端未导入旧 `@deepseek-ai/dsh-client-runtime/client`，没有依赖 `conversationEvents`。不需要复制招投标的热修复。现有 Session Tab 集成使用 Better Sidebar 能力协商；原生草稿使用 conversation.input.shell。运行时代码未改写，只新增独立只读预检 CLI。

原 README 的 0.1.2-alpha.2 验证基线已更正，不再把历史版本测试当作当前支持证据。context 是可选共存插件，不是 AI 填表必装依赖。

## 预检

`lib/preflight.js` / `form-fill-preflight` 读取指定 profile 的侧栏与 context package.json，在空临时 DSH_HOME 中执行实际宿主的 --version；不读取会话或凭据、不运行插件树、不修改 profile、不自动安装或重启。计划版本参数允许在升级前评估目标组合。缺信息和已知不兼容退出 2，未知组合明确报告 unverified。

已知硬不兼容：旧 DSH + 新侧栏缺 SessionLogOffset；新 DSH + 0.17.1 侧栏缺 settingsNamespace；新 DSH + 已安装 context0.36.0 使用旧设置接口。给出固定版本和成套升级路径。没有扩大产品 peer 范围。

## 验证层级

- Node v25.9.0 本地，123 项自身测试与四包检查通过；新增预检测试覆盖已装/计划版本、只读性、已知阻断和未知组合。
- 从 npm pack 产物在临时 profile 安装；使用完整隔离 DSH 0.1.2-rc.1 + Sidebar0.18.1 + context0.48.0。
- 真实浏览器：侧栏单例、收起、Tab X/恢复，三套合成 XLSX 的预览/人工确认/导出，真实文件 input 自动解析、字段映射应用及原生填写指令回填；普通新会话输入合成草稿；页面未捕获异常。
- 合成模板：客户台账 6 格、供应商准入表 4 格、合同主体信息表 6 格。使用产品 mock/fixture 结果，未调用计费 MCP、未发送模型请求。这些结果不等于真实企业查询验收。
- 预检从安装后的 tarball 执行；源码和实际加载客户端不含上述旧模块/服务。没有用测试替身伪造缺失模块。
- 新 DSH + 旧 Sidebar0.17.1 的实际启动失败证据已确认，纳入预检。完整隔离旧宿主 0.1.1-rc.2 + Sidebar0.17.1（不装 context）也通过相同业务、侧栏和原生草稿回归，页面错误为零。旧宿主安装需补齐其正式 peer；没有替换某个生产 SDK。

| 完整宿主 | Sidebar | context | 当前验收 |
|---|---|---|---|
| 0.1.2-rc.1 | 0.18.1 | 0.48.0 | 最终 tarball + 真实浏览器业务 fixture 通过 |
| 0.1.1-rc.2 | 0.17.1 | 未安装 | 最终 tarball + 真实浏览器业务 fixture 通过 |
| 0.1.2-rc.1 | 0.17.1 | 未安装 | 实证启动失败，预检阻断 |
| 0.1.1-rc.2 | 0.18.1 | 未安装 | 前轮实证启动失败，预检阻断 |
| 0.1.2-rc.1 | 0.18.1 | 0.36.0 | 协调事故证据 + 预检单测阻断；不启动该已知坏组合 |
| 其他 | 兼容范围内其他版本 | 其他/无 | 未验证，不承诺兼容 |

## 复现入口

`npm run check` 先生成 artifacts；`scripts/dsh-sidebar-smoke.mjs` 接收 DSH_RC_BIN、SIDEBAR_VERSION、可选 CONTEXT_VERSION、PLAYWRIGHT_MODULE、CHROME_BIN。脚本自建临时 DSH_HOME/工作区/随机端口，拒绝43120。新宿主取完整独立安装中的 lib/bin.js。旧 `scripts/dsh-registry-install.mjs` 已加安装前预检与成套侧栏选择。

## 待办和发布边界

四产品全部候选共存由总账协调，本轮只验证 AI 填表与侧栏/context。未验证真实模型、真实 MCP 权限/费用、全部浮窗/底部组合。0.2.24 按独立新版本发布，不覆盖0.2.23或移动既有标签。回滚需恢复完整版本组合及升级前任务目录备份。
