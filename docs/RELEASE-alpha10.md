# 0.1.0-alpha.10

修复部分正常 XLSX 在上传时误报“ZIP 路径不安全或重复”，并补齐自定义文档属性、严格验证的 Excel calcFeatures 元数据兼容。合法空目录不会再被当作文件路径错误；路径穿越、重复、文件/目录冲突、异常目录内容及未知扩展仍阻断。导入页同步更新支持范围说明。

主包 dsh-form-fill-agent 与内核 form-fill-core 为 0.1.0-alpha.10；Provider 无变更，继续消费已发布 0.1.0-alpha.9。

## 本地验收

- npm run check：98 tests，98 pass，0 fail，0 skip；三包打包检查通过。
- 合成文件覆盖目录、自定义属性、计算元数据的预览、填写副本、二次分析及不安全输入拒绝。
- 用户同名文件仅做本地只读分析，成功识别 1 张表，无真实 QCC 调用或原始文件入库。

## 待发布包 SHA-256

- form-fill-core-0.1.0-alpha.10.tgz：3ae576e80493f6ae2f6e8c18a838d753d75236195dc5232607bf37be410efd6e
- dsh-form-fill-agent-0.1.0-alpha.10.tgz：73ea01e1b33566f902501a3b1a2bb8b2e84ff400d0222542eeceae4c870b6caf

发布顺序：core → agent。registry 完整性、README、三模板和双宿主隔离安装通过后同步 GitHub Latest。发布状态以最终回执为准。
