# U4 企查查蓝界面升级 — 0.1.0-alpha.6

本轮主包 alpha.6，共享内核与 Provider 保持 alpha.5。依据原任务“DSH插件-【数据清洗补全 智能体】”最新品牌升级记录及共享规范 v1.1.0 实施。

权威设计源只引用，不在仓库另行复制：

- [共享交互规范 v1.1.0](../../../../AI-设计/DSH智能体开发交互规范方案.md)
- [企查查蓝 Mockup v1.1.0](../../../../AI-设计/DSH智能体_企查查蓝_UI_Mockup_v1.1.0.html)

## 本轮实现

- 自有侧栏节点置于新会话和工作区之间。菜单“AI填表”；专属首页采用 Mockup 表格线性图标与“AI填表智能体”横排居中。
- 自有 CSS 使用规范深浅色令牌，跟随宿主主题；不覆盖 DSH 顶部标志、原生发送或其他智能体。退出业务会话恢复原首页，卸载清理自己的节点、样式和事件。
- 四步向导：来源、规则、字段、确认描述。支持字段搜索、多选、会话内草稿恢复、Escape；窗口级居中，窄屏正文滚动、按钮可访问。
- 手写输入回填前选择替换、追加或取消。确认期间输入发生变化则重新询问；重复回填不重复追加且保留手写前缀。不自动发送。
- /scope 携带 revision 和任务所属校验；字段范围影响实际 FillPlan 和写回，未选字段记为 user-excluded。schema 4 持久化，兼容读取 1–3；回退旧版需独立任务目录。
- 工作台字段搜索、单元格过滤、已选/总数、完整清单下载。过滤不删除隐藏行的选择；右栏可展开，关闭不取消任务。

## 验收命令与结果

| 命令 | 结果 |
| --- | --- |
| npm run check | 60 tests，60 pass，0 fail；三包白名单及 README 打包通过 |
| node scripts/native-ui-smoke.mjs | 入口相对位置、首页/普通会话恢复、主题、草稿取消/追加/替换/重复、搜索、1440/390 视口通过 |
| node scripts/configuration-ui-smoke.mjs | 映射、刷新恢复、候选人工选择、预览和窄屏通过 |
| LEGACY_REPO=../dsh-data-cleaning-agent-form-fill-compat-v086 npm run test:consumer | 旧插件 211 tests + 24 golden；新包三套 tarball fixture 3/3；无 workspace 链接 |
| node scripts/dsh-native-smoke.mjs | rc.2、alpha.2 全新隔离 Host：入口、品牌、六格示例、草稿、下载、恢复、普通会话通过 |

浏览器脚本需要 PLAYWRIGHT_MODULE、CHROME_BIN；双宿主脚本另需 DSH_RC_BIN、DSH_ALPHA_BIN。测试只使用隔离 DSH_HOME、随机端口和合成模板，不使用生产 profile 或 43120。截图可通过 FORM_FILL_SCREENSHOTS 输出至仓库外；截图模拟与真实 Host 证据分开。

## 适配边界

- DSH 无独立首页标题公开槽位：对已验证默认标题做业务会话限定适配，缺少结构时保留宿主标题；不使用全局 brand.mark 单占位扩展。侧栏缺少工作区标记时回退原生 footer 扩展点。只声明 rc.2 / alpha.2。
- 主产品已有 XLSX/六类工商字段范围不扩展为 OCR、文本名单或复杂 Excel；未提供原始整表交互网格，填写预览保留全部可填写单元格与未完成清单。
- 业务描述与短执行关联共同回填；没有隐藏参数通道。任意改写文字不能保证重建结构化字段范围，用户应返回向导/工作台调整。
- 本轮不改 Provider、工具名称或 QCC 传输；真实模型验收和发布结果在收口时追加。CI、npm/GitHub 发布未完成前不把本地通过等同已发布。
