# 0.2.0

正式编号版本，三包统一为 0.2.0。包含 XLSX 安全解析、字段映射、候选确认、只填空白、完整表格预览、选择恢复、任务取消/重试及新副本下载；支持受限 Excel 保真与 129 项 QCC 字段目录。工作台采用企查查蓝图标短标题菜单。

运行时内核及 Provider 版本标识与 package.json 对齐。三套 golden 更新仅涉及版本和派生计划/变更 ID，字段值、机会、规则和不完整项逐项保持一致。任务 schema 5、核心 schema 1 保持不变；旧未执行计划若版本不符需重新分析，不能篡改版本绕过校验。

## 本地验收

- npm run check：98 pass / 0 fail / 0 skip；三包 pack 检查通过。
- 正式版本编号不替代非技术用户签收、Microsoft Excel 桌面验收或市场维护者合并，待办继续见 docs/PROGRESS.md。

## 待发布包 SHA-256

- form-fill-core-0.2.0.tgz：b327ad0de01aea906ffad2486d958f9bd27c27954f10744ddf7cc50a7c6ed92c
- qcc-form-fill-provider-0.2.0.tgz：899f3f70bb17d1397ebd8a8d397e52b18c423c86edae1874239e86818e3a0a22
- dsh-form-fill-agent-0.2.0.tgz：ca68d431a69a2a5b62eb3a13178c4872b1640ad66798411e97c9283fd42dd2b8

按所有者指定使用 Git tag V0.2.0；GitHub Release 标题 0.2.0，正式 Latest。发布顺序 core → Provider → agent，npm 发布后再验收 registry 完整性、README、三模板及双宿主安装。
