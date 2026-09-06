# form-fill-core

AI填表的共享 XLSX 内核，提供安全解析、填写机会识别、计划与变更清单、确认后写出副本。

## 安装

```sh
npm install form-fill-core
```

Node.js 22 或以上。主要导出：parseWorkbook、analyzeDocument、buildFillPlan、executePlan、applyChangeSet；legacy-csv 子路径保持既有清洗插件契约。

analyzeDocument 的第三个参数可包含 sheets（工作表名数组）、headers（sheet/row）、mappings（sheet/column/field；null 为排除）、anchors（sheet/row/value；人工核验的主体）。设置不会改写输入单元格；变更后的计划须重新预览并确认。

仅支持受限 XLSX。固定文本选项的内嵌下拉验证原样保留，返回值不在选项内时不填写；普通内部公式、固定区域或固定命名区域下拉、基础条件格式和普通表格对象受限支持；有填写时清除公式缓存并请求 Excel 完整重算。共享/数组/未知函数、宏、外部链接、图表等不支持。任何未编辑 ZIP 部件的解压内容保持一致。

[完整安全边界](https://github.com/duhu2000/dsh-form-fill-agent/blob/main/docs/security.md) · [源码](https://github.com/duhu2000/dsh-form-fill-agent)

MIT License.
