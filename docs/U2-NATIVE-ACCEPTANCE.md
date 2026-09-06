# U2 原生宿主验收与当前边界

2026-09-06。U2 原生界面与真实模型/QCC 闭环均已完成。代码 f79c3f6、v0.1.0-alpha.3 tag 与 GitHub 预览 Release 已推送；npm dsh-form-fill-agent@0.1.0-alpha.3 发布成功。按所有者要求将 latest 指向 alpha.3，官方 registry 已核验 version、latest、next 均为 0.1.0-alpha.3；未重新发布包或移动 Git tag。

## 本轮发现和修复

1. alpha.2 npm 包缺少 exports["./package.json"]。真实 DSH clientModules 用 require.resolve(packageName + "/package.json") 发现客户端，解析失败被视为无客户端，因此独立页面可用却不显示原生入口。已补导出，并增加实际 require.resolve 回归。
2. dsh.client.inject 是模块名列表；factory 的 inject 才是运行时服务名。清单改为官方 layout/conversation 模块，未引入第三方界面依赖。
3. 真实宿主没有测试夹具的 data-slot="conversation" 容器；右栏覆盖输入框。改用 composer 最近的 data-phase 容器，关闭或切换会话后恢复原 padding；旧标记保留为降级。
4. 关闭工作台后从填写预览恢复已完成任务时，异步恢复会强制切到下载。恢复期间保留父窗口请求的导航，避免覆盖用户选择。
5. rc.2 的 startSession 在 workspaces，alpha.2 迁至 uiWorkspace。新增可选运行时注入，以同一业务前缀限定普通新会话桥接；清理恢复原属性描述符，服务缺失不阻止插件加载。

## 实际验证范围

scripts/dsh-native-smoke.mjs 使用实际 CLI、全新 DSH_HOME、合成工作区、随机非 43120 端口、独立 Chromium；包通过 npm tarball 安装。仅通过 Host API 准备已有合成目录，业务会话创建、导航、草稿回填、确认与下载均从原生界面执行。

| 验证 | rc.2 / alpha.2 |
|---|---|
| 原生侧栏入口、插件客户端实际加载 | PASS / PASS |
| 专属业务会话、六格合成表预览 | PASS / PASS |
| 指令回填原生 Composer | PASS / PASS |
| 右栏不遮挡 Composer，真实 boundingBox 断言 | PASS / PASS |
| 确认新副本、浏览器下载 HTTP 200 | PASS / PASS |
| 关闭再从填写预览恢复已完成任务 | PASS / PASS |
| 普通新会话不沿用业务菜单 | PASS / PASS |
| 真实模型调用 form_fill_enrich | PASS / PASS |
| 真实 DSH QCC 连接与六字段查询 | PASS / PASS |
| 保持工作台打开时自动刷新六格预览 | PASS / PASS |
| 真实填写副本再次分析无新增填写 | PASS / PASS |

npm run check：50 tests、50 pass、0 fail、0 skip，三包打包检查通过。scripts/native-ui-smoke.mjs 的既有 React/Chromium 契约也通过。

补充回归：Node 22.19.0 和 24.19.0 各 50/50；scripts/dsh-smoke.mjs 两版三模板、浏览器、重启恢复及卸载组成均通过。所有测试使用本地候选 tarball，未将候选误认为 npm 已发布版本。

提交 64f362c 的 [六组远端 CI](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34035608374) 全部通过。候选 tarball 消费回归：旧插件 0.8.6 的 211 tests + 24 golden、新插件三模板 3/3，通过且没有 workspace 链接。

运行真实原生回归前设置 DSH_RC_BIN、DSH_ALPHA_BIN、PLAYWRIGHT_MODULE、CHROME_BIN，再执行 node scripts/dsh-native-smoke.mjs。可加 FORM_FILL_KEEP_HOST=1，在两版验收通过后保留最后一个隔离 Host；控制台仅输出本地设置地址和隔离目录，SIGINT/SIGTERM 结束并关闭该子进程。不保存认证 URL、浏览器 storageState 或宿主原始日志。

## 真实模型验收

用户已在本任务的隔离 Host 设置页完成测试模型配置。rc 验收仅复用本任务隔离测试设置，未读取生产 DSH profile。

已使用用户明确提供并确认所属服务的 QCC 凭据，接入 https://agent.qcc.com/mcp/company/stream。rc.2 与 alpha.2 均完成真实模型驱动工商查询。

新增 scripts/isolated-qcc-host.mjs：仅接受本任务生成的隔离目录，从关闭回显的 stdin 读取授权信息，放入子进程环境；生成的 patch 只含环境变量引用，QCC 凭据不落盘、不放命令行参数、不记录原始日志。原始模型设置、已有任务与用户 patch 不覆盖。此进程结束后需要重新注入 QCC 凭据。

alpha.2 Web 首页需要浏览器启动认证，裸 origin 在新浏览器中会返回 401。设置 FORM_FILL_OPEN_BROWSER=1 时由 DSH 自带流程打开认证入口；启动器不打印或保存该认证 URL、不关闭认证。此前只提供裸地址不足以进入设置页，已修正此操作流程。

scripts/dsh-live-e2e.mjs 从关闭回显的 stdin 接收测试授权与企业名称，仅在内存创建测试 XLSX。实际原生 UI 上传后断言 changes=0；回填草稿、点击发送，等待模型调用 form_fill_enrich，再断言 revision 增长、六格来源均为 qcc://、保持打开的工作台自动显示六行。确认下载后重新分析副本，secondPassChanges=0。两版均输出 PASS；不使用 mock 事实，不保存原始模型日志、浏览器认证 URL 或真实企业数据至仓库。端口分别为 52174 和 52173，测试后关闭子进程。

命令：配置 PLAYWRIGHT_MODULE、CHROME_BIN 后执行 `node scripts/dsh-live-e2e.mjs <isolated-home> <dsh-bin> <isolated-port>`，授权与测试主体由 stdin 提供。该测试需要已配置模型的隔离 Host；不会进入无凭据 CI。此前一次 rc 尝试没有完成工具调用，未计为通过；最终同一驱动在两个基线均完成上述断言。

最终 `npm run check`：50 tests、50 pass、0 fail、0 cancelled、0 skipped、0 todo，三包打包 PASS。agent 候选 tarball SHA-256：0247d105120f64fdbea1195fe750618a9080d55ad259e68c6341c6e10c24efeb。

发布提交 f79c3f6 的 [最终 CI](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34038642596)：Windows/Linux/macOS × Node 22/24 六组全部 success。[GitHub 预览 Release](https://github.com/duhu2000/dsh-form-fill-agent/releases/tag/v0.1.0-alpha.3) 已附 agent tarball；npm 与市场状态单独核验，市场草稿 #4487 的 Submission gate 仍未通过。

## 文件与兼容边界

发布后验证：`node scripts/registry-smoke.mjs` 退出 0，官方 npm 三包 integrity 3/3、三模板 E2E 3/3、无 workspace 链接；设置 DSH_RC_BIN、DSH_ALPHA_BIN 后执行 `node scripts/dsh-registry-install.mjs` 退出 0，0.1.1-rc.2 与 0.1.2-alpha.2 均 registryInstall/bundleReconcile/uninstall PASS。使用两个全新隔离 DSH_HOME，无生产 profile，未开启端口。

修改智能体 package.json、lib/client.js、lib/ui.html、lib/http.js；根 package.json/package-lock.json；test/http.test.mjs；新增 scripts/dsh-native-smoke.mjs、scripts/isolated-qcc-host.mjs；更新 CHANGELOG、README 与进度文档。
form-fill-core、qcc-form-fill-provider 和清洗插件源码未修改。两个共享包仍为 alpha.1。已发布 alpha.2 tag 保持原样；alpha.3 仅新增本插件版本。
