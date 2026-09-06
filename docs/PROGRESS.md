# AI填表开发进度

当前增量：alpha.5 三包候选完成字段配置、候选人工确认、固定选项下拉保真及 schema 3。59 项测试、新浏览器控件、双 DSH/原生/真实模型闭环均通过，旧 0.8.6 消费新版 core 的 211 tests + 24 golden 通过；最终 CI 与发布待收口。完整范围和未完成项见 [U3-CONTROLS-ACCEPTANCE.md](U3-CONTROLS-ACCEPTANCE.md)。alpha.4 npm 已发布且 README registry/安装包验证通过，先前“等待账号验证”为历史记录。

alpha.4 发布修复：实际 npm 子包此前缺少 README，现已加入用户说明并增加 tarball README 必检与 registry/安装包 README 一致性检查。50 项测试及打包通过，运行代码和共享依赖不变。4763ce4 的六组 CI（run 34039715682）全部通过；v0.1.0-alpha.4 tag 与 GitHub Latest Release 已发布。npm 发布等待账号验证，尚未执行 alpha.4 registry 回归，npm latest 暂为 alpha.3。

最新开发增量（alpha.3）：修复真实宿主发现客户端、右栏遮挡、完成任务恢复导航及 alpha.2 普通会话复用问题。两版真实原生入口→业务会话→六格合成预览→草稿回填→确认下载→恢复→普通会话通过；50 项测试通过。U2 真实模型/QCC 全链路现已在 rc.2 与 alpha.2 通过，工作台自动更新六格并下载副本，副本再次分析新增填写为 0。详见 [U2-NATIVE-ACCEPTANCE.md](U2-NATIVE-ACCEPTANCE.md)。

发布收口：f79c3f6 六组最终 CI 全绿，v0.1.0-alpha.3 tag、GitHub Release 与 npm 已发布；按所有者要求，next/latest 均为 alpha.3，默认安装版本已核验。发布后三包 integrity 3/3、三模板 E2E 3/3、双基线全新隔离 DSH 安装/卸载通过。旧 0.8.6/new tarball 消费回归全绿。QCC 凭据只在测试子进程环境中使用。

本轮增量：0.1.0-alpha.2 已实现五步工作台、原生业务会话导航、指令回填、任务历史与 revision、单元格排除。49 项测试通过；原生 React 契约验收通过；双基线 DSH 网页/重启验收通过。下文为此前 M0–M2 阶段记录；最新范围、命令、发布状态以 [U1-ACCEPTANCE.md](U1-ACCEPTANCE.md) 为准。

发布收口：代码 4f74b41 与 v0.1.0-alpha.2 已推送，GitHub Release 和 npm alpha.2 已发布；next=alpha.2、latest=alpha.1。发布后三包 integrity、三模板 registry E2E、两版全新隔离 DSH 安装/卸载均通过。

更新：2026-09-06。本地 M0/M1 已完成，M1.1 工作台上传、预览、确认、下载及双基线隔离验收已完成；原生侧栏入口仍需人工宿主界面验收。整体产品尚未完成。完整命令与结果见 M1-ACCEPTANCE.md。

后续 M2 已完成工商 Provider、真实 MCP 写回验证、Agent-owned 高层工具和任务持久化，当前 46 项测试通过。项目所有者已授权真实调用及发布；渠道状态以 M2-ACCEPTANCE.md 为准。

| 阶段/能力 | 状态 | 交付或边界 |
|---|---|---|
| 移交文档与旧会话接收 | 完成 | 读取方案 2B、移交清单及原会话相关规划/移交内容 |
| 原始 Git/package/CHANGELOG 核验 | 完成 | ee8dafb/v0.8.2；记录后续其他进程引入的版本变化 |
| cwd 用户改动审计 | 完成 | 保留代码；双基线真实 SDK 方法探针通过 |
| 旧检查恢复全绿 | 完成 | 202/202；新增 golden 后运行器计数 204/204 |
| Phase 0 特征测试 | 完成 | 24 case golden；工具、路由、任务、制品指纹守卫 |
| 三包 monorepo | 完成 | 根 npm 项目 private；三个子包按授权配置为可发布 |
| XLSX 安全解析与结构识别 | 完成（受限范围） | 安全/保真矩阵见 security.md |
| 字段语义、空位、主体锚点 | 完成（确定性规则） | 同义词精确映射、歧义拒绝；未接 LLM |
| FillOpportunity/FillPlan/ChangeSet | 完成 | 来源、时间、置信度、调用估算、默认只填空白 |
| Mock / 工商 QCC Provider | 完成（六类字段） | 合成模板独立；真实 MCP 写回验证通过 |
| 预览、确认、副本、清单 | 完成 | 客户台账 6 格、供应商 4 格、合同主体 6 格 |
| 旧消费者通过 tarball 接入 | 完成（兼容工作树） | faf09eb/0.8.3 与 dea5959/0.8.6；未合入旧插件发布主线 |
| 新消费者 tarball E2E | 完成 | 三套 fixture 3/3，无 workspace 链接 |
| 独立本地 Web/CLI 演示 | 完成 | 浅/深色、390px、上传与下载验证通过 |
| DSH 双基线基础加载 | 完成 | 两版全新隔离 Host；无第三方 UI 插件 |
| DSH 实际填表工作台 | 完成（原生验收） | rc.2/alpha.2 原生入口、会话、草稿、预览与下载均通过 |
| QCC Provider 完整迁移 | 待开发 | 工商六类字段已实现且真实调用已授权；完整 catalog/bridge 迁移仍需 golden/parity |
| DSH Agent-owned 高层工具编排 | 已验收 | form_fill_enrich 嵌套执行；双基线真实模型/QCC 对话闭环通过 |
| 持久任务、重启恢复 | 已完成 | 两版真实 Host 重启后下载恢复；24 小时 TTL、删除、进程锁 |
| 运行中取消、多进程/多用户服务 | 待开发 | 当前运行中拒绝冲突操作，单进程本机服务 |
| 复杂 Excel 保真、Word | 待开发 | 当前明确拒绝未支持结构；Word 后置 |
| Windows/Linux/macOS × Node 22/24 | CI 已通过 | 六组检查全绿；非技术用户人工验收待完成 |
| GitHub/npm/市场发布 | GitHub/npm 已发布 | 三个 npm 包及预览 Release 已发布；市场草稿 #4487 等仓库满 1 天及维护者审核 |

下一步顺序：映射/候选/单元格选择完善 → 扩展 Excel 保真与完整 Provider parity。alpha.3 发布及 registry 回归已完成，市场仍待准入门禁与维护者审核。详细计划见 [UI-UPGRADE-PLAN.md](UI-UPGRADE-PLAN.md)。

2026-09-06 本轮规划核验：清洗插件已推进到 f17ecc4 / 0.8.7；其首页与工作台方案已查阅，但共享 core 的旧消费者兼容验证仍只覆盖至 0.8.6。AI填表 npm 的 next/latest 当前均指向 0.1.0-alpha.1，仍为预览版；市场 #4487 仍为未合并草稿。

产品展示名为 AI填表；机器标识仍为 dsh-form-fill-agent / form-fill-core。M1 时的授权限制已由所有者后续明确指令更新。
