# M0 / M1 / M1.1 本地验收
日期：2026-09-06。版本：0.1.0-alpha.1，private。产品：AI填表；市场全称：AI填表智能体。

## 本轮交付
- 新增 test/http.test.mjs：工作台双路径完整生命周期、确认摘要、下载保护、幂等、同源/Host/编码/大小校验、容量竞争、过期、卸载及可选入口降级，共 5 项测试。
- scripts/dsh-smoke.mjs：由 health 探针扩展至双版本真实隔离 Host 的三模板预览、确认、下载、二次零变更；可调用浏览器验收。
- scripts/web-smoke.mjs：修正 /form-fill 子路径下载 URL 和 Origin，支持真实 DSH 工作台。
- docs/PROGRESS.md、docs/compatibility.md、本文、README.md：同步里程碑、0.8.6 兼容证据和演示入口。
- 独立兼容工作树 dsh-data-cleaning-agent-form-fill-compat-v086（dea5959）：只修改 lib/engine.js、package.json。旧主线仍干净，无本任务覆盖。
- 保留既有 monorepo 三包、三模板、core 34 项测试、CLI/Web、副本写回、golden、pack 和历史兼容工作树。

## 命令和完整汇总
全部命令退出码 0，无失败、取消、跳过或 todo。

| 命令 / 环境 | 结果 |
|---|---|
| npm run check（新仓） | 39 tests，39 pass；三包 pack PASS |
| Node 22.19.0：node --test test/*.test.mjs | 39/39 |
| Node 24.19.0：node --test test/*.test.mjs | 39/39 |
| npm run check（旧主线 dea5959 / 0.8.6） | lint/docs/marketing/pack 通过；211/211 |
| npm run test:consumer（默认 faf09eb / 0.8.3） | 204/204；24 golden；新 tarball 消费 3/3 |
| LEGACY_REPO=../dsh-data-cleaning-agent-form-fill-compat-v086 npm run test:consumer | 211/211；24 golden；新 tarball 消费 3/3 |
| node scripts/dsh-smoke.mjs（配置下列环境） | rc.2、alpha.2 各三模板闭环、浏览器、移除 bundle 配置恢复 PASS |

DSH 验收环境变量：
```sh
export DSH_RC_BIN=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
export DSH_ALPHA_BIN=../dsh-data-cleaning-agent/spike1/cli-alpha2/node_modules/@deepseek-ai/dsh/lib/bin.js
export PLAYWRIGHT_MODULE=/Users/qcc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node scripts/dsh-smoke.mjs
```

两个 Host 均使用脚本新建 DSH_HOME、合成 workspace、随机非 43120 端口。未继承凭据环境；结束时关闭自建进程。浏览器各验证三模板、真实文件上传、浅色/深色/390px、跨站与下载保护，page errors 0。窄屏截图已人工视觉检查无水平溢出。原生侧栏 React 入口仅有降级/注册单测，未宣称已验证宿主侧栏实际点击。

| 模板 | 写入格数 | 未完成项 | 二次分析新增填写 |
|---|---:|---:|---:|
| 客户台账 | 6 | 6 | 0 |
| 供应商准入表 | 4 | 9 | 0 |
| 合同主体信息表 | 6 | 1 | 0 |

详细原始测试输出保存于 artifacts/acceptance/，仅含合成验收日志（git ignored）。
兼容范围是已抽取 CSV 能力以及旧工具/路由/任务/制品的 golden 指纹；没有把新 mock Provider 冒充真实 QCC Provider parity。

## 可运行演示
在新仓运行 npm run demo:web，然后访问 http://127.0.0.1:43260。
选择三套模板之一 → 检查每格旧值/新值/来源及未完成项 → 确认生成新副本 → 下载 XLSX、变更清单、未完成项。
也可运行 node scripts/run-demo.mjs --confirm-synthetic 生成三套本地输出。已验收页面截图在 artifacts/screenshots/。
DSH 中的工作台路径为 /form-fill/；上面的 smoke 会自动在隔离 Host 验证并关闭，不安装生产 profile。

## 边界与下一步
本地 M0/M1 闭环完成，M1.1 工作台通过双基线验收，完整产品尚未完成。
下一步首先建立 QCC catalog/bridge 契约与无网络适配测试，然后开发持久任务/恢复及复杂表格能力。
当前仅 XLSX 受限子集，默认只填空白；公式、宏、图片及其他未支持结构明确拒绝。语义映射为确定性别名规则，未接 LLM。预览内存保存 15 分钟，未实现跨重启恢复。Windows/Linux 和原生侧栏人工验收待完成。
真实 QCC、GitHub 远端创建、push、tag、npm 发布和市场提交均未执行；这些外部动作仍需用户明确批准。本地开发和合成测试可以继续，不需要新增批准。
