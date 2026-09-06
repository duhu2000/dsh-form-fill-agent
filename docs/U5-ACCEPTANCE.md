# alpha.8：网格、执行控制与保真验收

日期：2026-09-07。三包开发版本为 0.1.0-alpha.8，npm 发布按所有者要求延后，当前 npm latest 仍为 alpha.7。Git 提交、tag 和 CI 状态在本文件最后记录。

## 实现

- 完整原表/结果网格按工作表、行页、列窗口查看；搜索覆盖所有列，选择不受当前筛选影响。公式结果不会展示为已经重算的事实。
- 完整候选与已选择 ChangeSet 分开持久化，排除项可恢复；兼容旧任务的 user-excluded 事实。
- 查询逐调用持久化检查点，运行中取消，重启识别 interrupted；仅失败、取消或未执行字段重试。既有成功结果与用户排除保持不变。
- 字段规则只在表头签名一致时显式复用；未知字段有人工设置指引。真实候选检索按官方工具契约接入，所有候选（包括唯一匹配）都需要确认。
- 26 个工商字段保留原字符串，不换算金额、不猜缺项。默认独立 Provider 不启用候选检索；DSH 运行时发现工具才启用，按最坏两次查询估算。
- 受限支持普通内部公式、固定区域及命名区域下拉、基础条件格式和普通表格对象；清除受影响工作簿的公式缓存，请求 Excel 重算。拒绝共享/数组公式、未知函数、外部链接、宏和未支持扩展结构。
- 任务存储 schema 5，兼容读取 1–5；核心计划和变更 schema 仍为 1。访问边界见 security.md。

## 验证命令与结果

浏览器脚本需设置 PLAYWRIGHT_MODULE、CHROME_BIN。宿主脚本另需 DSH_RC_BIN、DSH_ALPHA_BIN，全部采用隔离 home/端口。未使用生产 profile 或 43120。

| 命令 / 验收 | 结果 |
|---|---|
| npm run check | 70 tests：70 pass、0 fail、0 skip；三包 pack、README、文件白名单、凭据扫描通过 |
| LEGACY_REPO=../dsh-data-cleaning-agent LEGACY_ADAPT=1 npm run test:consumer | 清洗 0.8.8 / 6cea166 接入前后各 215 pass；24 golden parity；三模板真实 tarball E2E 3/3，无 workspace symlink |
| node scripts/native-ui-smoke.mjs | 原生 React 契约、独立会话、品牌、导航、草稿、恢复、响应式及普通新会话通过 |
| node scripts/configuration-ui-smoke.mjs | 字段修正/复用/刷新、显式候选、可恢复选择、完整网格搜索、取消按钮和 retry 指令通过 |
| npm run demo:web + node scripts/web-smoke.mjs | 三模板、真实上传、深/浅色、390px、下载边界通过，page errors=0 |
| LEGACY_TARBALL=... node scripts/dsh-native-smoke.mjs | 清洗 0.8.8 与填表 alpha.8 同装 rc.2 / alpha.2：入口、品牌、手写草稿、工作台、下载、恢复和普通会话通过 |
| node scripts/dsh-live-e2e.mjs isolated-home bin isolated-port | 两宿主真实模型调用 form_fill_enrich → QCC → 六格预览 → 确认副本；二次分析新增填写 0 |
| node scripts/performance-smoke.mjs | 合成 5,000 行 / 50,000 格 / 4,326,567 bytes；一次本机测量分析 629 ms、搜索 542 ms、RSS 335 MiB |
| 真实工具契约验收 | 工商响应归一化 23 个实际可用字段；其余字段缺失不填。检索解析 5 个候选；原始响应仅在内存验证，未保存到仓库 |

性能数字为单次本机测量，不是跨平台承诺。上限由文件大小、解压大小、单元格数量共同决定；100,000 格并不保证任意文字长度的文件都能导入。

旧消费者本轮只接入 legacy-csv，保持工具/路由/任务/制品及 24 个行为 golden；不能据此声称 128 字段 Provider 已全部迁移。三模板 golden 更新前先剔除版本和派生 hash 比较业务内容，确认一致后更新版本戳。

## 验收边界及后续

非技术用户正式操作签收、Microsoft Excel 实际重算与更广泛文件验收须使用 USER-ACCEPTANCE.md，自动化不能代替本人签收。非工商 catalog/bridge 仍是独立后续批次；每批必须先建契约/golden/parity，再做真实调用验收。当前交付不是任意 Excel 编辑器，也不是完整 128 字段迁移。

取消无法撤回远端已经执行的请求；崩溃发生于远端完成、本地检查点之前时，重试可能再次调用。更换 Provider 版本导致计划变化时不能沿用旧检查点重试，应重新完整核验。旧版本不能读取 schema 5，回退使用升级前目录副本或新目录。

市场 PR #4487 仍为 open draft，check 通过、Submission gate 因仓库不足一天失败；最早北京时间 2026-09-07 19:09 后才满足年龄条件，之后还需维护者审核并合并。未绕过门禁，尚未上架。

## 次日发布

今晚不执行 npm publish，不请求账号认证，不提前把 GitHub Latest 从已发布 alpha.7 改到未发布 alpha.8。次日按 core → Provider → agent 顺序发布已验收 tarball，再检查三个包完整性、README、真实 registry 安装及双宿主回归，最后同步数字标题的 GitHub Latest。

Git/CI：dec780d744c970b696bab4ae97d63c454a63d7a8 已提交和推送，v0.1.0-alpha.8 已推送；CI 34046857236 六组成功。npm：未发布 alpha.8。后续非工商迁移继续推进为 alpha.9，见 U6-ACCEPTANCE.md。
