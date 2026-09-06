# alpha.11 后续验收收口

日期：2026-09-07。产品仍为主包 alpha.11、内核 alpha.10、Provider alpha.9；本轮新增测试工具及文档，不发布新的产品版本。

## 经营与风控域真实宿主端到端

DSH 0.1.2-alpha.2 和 0.1.1-rc.2 均通过以下流程：上传表格本地分析（零真实查询）→向导回填→原生发送→真实模型调用 form_fill_enrich→工商身份核验→经营/风控工具→四格预览→人工确认动作的浏览器模拟→下载副本→再次分析新增填写 0。

| 验证字段 | 真实来源工具 |
|---|---|
| 所在地海关 | get_import_export_credit |
| 风险有记录因子数、风险无记录因子数 | get_company_risk_scan |
| 有风险关联方数 | get_company_related_risk_scan |

每条最终成功链路实际完成三次工商核验和三个领域调用。仅验证来源、单元格数量、现有字段契约与输出一致性，不输出企业风险结论、不跨维求和、不把计数解释成企业安全或不安全。

连接方式：隔离 DSH 的三个 stdio MCP Server，通过本机临时测试桥逐请求转发到本会话已认证的真实企查查连接器。结果是即时真实工具返回，非 mock 或响应重放。该证据覆盖真实宿主工具命名、Agent-owned 嵌套执行、Provider、持久任务及 UI 链路；不冒充用户生产 DSH 中三个官方 HTTP Server 的 OAuth 配置验收。

初轮失败属于测试配置：DSH 子进程会过滤认证形状的环境变量，需要显式 runtime env 传入临时桥接密钥；首个等待中的请求曾触发超时。修正测试环境变量与超时后，两版最终运行均完整通过。未放宽产品安全规则或修改生产配置。

## 可复用测试入口

- scripts/live-connector-bridge.mjs：仅四个工具白名单和单个获授权测试主体，临时本地端口、运行时随机密钥、内存待响应队列；不记录原始响应。
- scripts/prepare-domain-host.mjs：只接受已有 synthetic-native-test 隔离模型 home，创建新的私有临时 home，安装本地 tarball；不覆盖来源 home。
- scripts/dsh-live-e2e.mjs：FORM_FILL_LIVE_DOMAINS=1 启用跨域验收，stdin 提供测试主体和临时 bridgeKey，检查三个真实来源及下载闭环。
- scripts/prepare-user-acceptance.mjs：生成三套业务模板与 Excel 保真组合的原表/预期副本，使用合成 mock 数据；目标目录已存在时拒绝覆盖。

真实测试使用 52175、52176 和随机本机桥接端口，未操作 43120。结束后四个新建测试 home 已删除，内含的临时模型配置副本与测试数据随之清理；原有用户配置的隔离 home 保留，桥接和测试 DSH 已退出。真实主体名称、原始响应及凭据未写入仓库。

## 验证与交付

| 项目 | 结果 |
|---|---|
| npm test | 98 pass / 0 fail / 0 skip |
| 两版真实 DSH 跨域测试 | 各 4 格填写，三个扩展工具来源均覆盖，二次分析新增 0 |
| 生成合成验收包 | 4 套原表及 4 套预期副本；三业务模板填写 6/4/6 格，保真组合填写 1 格 |
| 独立 XLSX 反读 | 保真组合 B2=合成人员甲，B3=LEN(B2)，表格对象、关系及样式部件字节保留 |
| LibreOffice 独立 profile 重算 | PASS；公式缓存 999 被重算为 5；不替代 Microsoft Excel 验收 |
| 用户验收清单 | 已从 alpha.8 更新到 alpha.11，增加验收基线、版本及本人签收记录 |

默认合成包目录：artifacts/uat-alpha11/，该目录被 Git 忽略。已有文件不覆盖，重新生成请传入新的输出目录。预期副本明确标注 mock，不得冒充真实查询结果。

## 尚需外部条件

1. 正式用户验收：本人操作并签收 USER-ACCEPTANCE.md，自动化不能代签。
2. Microsoft Excel：本机 /Applications 未发现 Excel，仅有 LibreOffice/WPS；需在安装 Excel 的设备上按合成包说明验收。
3. 市场：检查时 PR #4487 仍 OPEN/Draft，普通 check 通过，Submission gate 失败；最早北京时间 2026-09-07 19:09 满足此前的一天年龄条件，之后重新检查、转待审核，仍需维护者合并。当前未上架。
4. 后续 Excel 结构：已提交用户样表的 ZIP/属性/计算元数据问题在 alpha.10 修复并保留。当前没有新增失败样表，不凭空扩大到宏、外链、图片等未支持结构；收到新结构时先建立最小合成 fixture。
5. 新工具与目录变化：本轮经营/风控当前契约通过真实宿主验证，未新增未知工具映射；后续目录漂移继续 golden/parity 和真实调用验证。
