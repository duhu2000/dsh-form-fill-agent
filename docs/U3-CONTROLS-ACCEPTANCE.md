# U3 首批填写控制与下拉保真验收

源码候选：三个包 0.1.0-alpha.5。不是完整 U3/U4 交付；本批范围如下。

## 实现

- 工作台可选工作表、表头行（界面列出前 30 个可见记录行）、表头对应的目录字段或“不填写”。只允许目录内字段；重复/冲突映射仍阻断。
- 设置应用到原始文件重新分析，旧预览清除，revision 增长。运行中或已确认任务拒绝修改，过期请求返回冲突。
- Provider 返回主体不一致时仅给出候选身份，不产生可填写事实。候选默认空选；只能选择当前返回的候选 ID，或手动确认完整登记名称/信用代码。
- 主体确认仅修改查询锚点，原表名称保持原样。真实任务确认候选不会调用 QCC，必须重新发送查询指令并精确核验。
- 内嵌固定文本选项的 Excel 下拉列表可导入并原样保留。填写值不在选项交集内时列为 validation-conflict；底层写出也阻断不合法值。
- 持久任务 schema 3 保存字段与主体设置，读取 schema 1/2；回退旧版必须使用升级前任务目录副本或新目录，不能让旧版忽略人工选择。
- 三个 npm 子包均有 README；打包检查要求 README 存在。alpha.4 的 registry README、安装包 README、三包 integrity 和三模板回归已通过。

## 测试证据

- npm test：59 tests、59 pass、0 fail、0 cancelled、0 skipped、0 todo。
- 新增 9 项：映射修正与非法设置、排除重复字段、revision 与已确认保护、候选伪造/空选/恢复/原名称保留、QCC 不一致后二次精确查询、下拉 XML 保真、引用/公式拒绝、工作表选择、真实模式确认零调用。
- scripts/configuration-ui-smoke.mjs：实际 Chromium 映射、刷新恢复、候选默认空选、选第二项、预览及 390/1024 宽度控件可达 PASS，全部合成数据。
- scripts/dsh-smoke.mjs：rc.2、alpha.2 均三模板、浏览器、持久化重启、卸载组成 PASS。
- scripts/dsh-native-smoke.mjs：两个真实宿主均入口、业务会话、六格演示、草稿回填、Composer 不遮挡、下载、恢复与普通会话隔离 PASS。
- LEGACY_REPO 指向旧 0.8.6 兼容工作树后 npm run test:consumer：实际候选 core tarball 替换在隔离副本内，211 tests + 24 golden PASS；新消费者三模板 3/3，无 workspace 链接。未修改旧仓。
- 三个已有 golden 的更新仅涉及包版本元数据、planId/changeSetId；更新前程序断言其余全部语义相同。legacy-csv 源码未变。

scripts/dsh-live-e2e.mjs 在已配置测试模型的两个隔离 DSH_HOME、端口 52173/52174 通过真实原生发送 → QCC 六字段 → 自动预览 → 下载闭环，filled=6、secondPassChanges=0。真实数据不进仓库，测试后子进程关闭。此真实测试验证既有精确查询闭环；新增候选异常分支使用合成响应契约测试，不冒充真实模糊检索验收。

提交 32d8abf 的 [最终 CI](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34040997267) 六组全部 success（Windows/Linux/macOS × Node 22/24）。v0.1.0-alpha.5 tag 已推送。qcc-form-fill-provider@0.1.0-alpha.5 已发布且官方 registry 查询可用；内核发布仍等待账号验证，智能体在依赖发布后继续发布。暂未将 GitHub Latest 从 alpha.4 改为 alpha.5，发布后再同步。

## 当前限制与后续

- 没有模糊检索候选工具。真实候选仅来自本次工商响应的身份不一致；简称需人工补充完整主体。没有迁移完整 QCC catalog。
- 映射变更会清除旧主体选择；不猜测新旧列的身份对应关系。
- 不支持公式、引用区域下拉、条件格式、表格对象、命名区域、图片/图表、Word；不是任意 Excel 保真。
- 仍为单进程本机任务；仅失败部分重试、运行中取消、可恢复的单元格多轮勾选、完整表格分页预览仍待后续版本。
- 旧插件消费者验证限 0.8.6 兼容工作树，不能外推到其最新主线。
