# XLSX 导入兼容修复（待发布）

2026-09-07：本地源码修复，npm alpha.9 尚不包含本修复。

用户报告选择 XLSX 后出现“ZIP 路径不安全或重复”。只读检查同名本地文件，确认合法空目录条目（例如 xl/）被当作包含空路径段而拒绝；继续分析发现 docProps/custom.xml 和标准 calcFeatures 元数据也被旧白名单拒绝。

- 合法 ZIP 空目录通过全部路径、解压、CRC、重叠检查后忽略，不作为 OOXML 部件。目录/文件冲突、重复目录、路径穿越及含内容目录继续阻断。
- 自定义文档属性经过现有安全 XML 校验，写出时保持原部件字节。
- 只允许严格匹配的 calcFeatures 扩展，原样保留；其他扩展、未知命名空间及实际不受支持公式继续拒绝。该结构记录计算引擎版本特征，不等于工作簿使用了同名函数：[Microsoft 规范](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/c1a60ba0-8af1-4b09-a666-8118f1c39d69)。
- 导入页更新公式、区域下拉等支持范围，移除过时提示。

真实文件只做本地只读分析，已成功识别 1 张表，未执行 QCC 调用；未复制原文件、企业数据或文档属性进仓库。仓库回归使用合成数据覆盖预览、写出副本、二次分析及恶意结构拒绝。

验证：npm run check 共 98 项全部通过，三包打包检查通过；LEGACY_REPO=../dsh-data-cleaning-agent LEGACY_ADAPT=1 npm run test:consumer 通过旧插件接入前后完整检查、24 行为 golden、128 catalog/21 投影 parity、七组 Provider 和三模板独立 tarball E2E。检查生成的本地 alpha.9 tarball 含未发布修复，不等于 registry 已发布版本；发布前必须升级新版本并重新记录哈希，不得重用 alpha.9 发布回执。
