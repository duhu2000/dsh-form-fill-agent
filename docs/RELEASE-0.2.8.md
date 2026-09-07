# 0.2.8

修复标准重复值高亮导致 XLSX 导入失败的问题。补充兼容同一文件的任意值校验和静态整数 between 校验；整数校验区域保留并禁止自动回填。未知规则、扩展及不安全公式仍拦截。

主包、共享内核 0.2.8，Provider 0.2.0。原用户文件只读验证已能分析，零真实查询；未把客户内容存入仓库。复杂布局仍需人工检查字段映射，本轮不代表全部字段自动填写或 Excel 桌面验收完成。

103 项测试覆盖规则与样式保留、普通字段写入、整数区域保护、未知扩展拒绝。tarball 消费验证通过清洗 full-check 与 24 golden parity、Provider 7 组及填表三模板端到端；旧 golden 仅版本和派生哈希变更，业务结果已比对不变。

## 发布回执

- 代码 60e1691566217df3e0aaa32209719233649a081d，标签 V0.2.8 已推送。
- [自动发布](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34120292292) 成功：六组 CI、OIDC 发布、registry 验收通过；首次 README 同步延迟重跑后通过。
- npm 主包与内核 latest 均为 0.2.8，GitHub Latest 为 0.2.8，非预发布。
- 双版本 DSH 隔离安装、bundle reconcile、卸载通过，未使用生产 profile 或打开端口。
