# 0.2.7

分析表格成功后默认展开完整原表。主包移除 workflow.js 隐式 100 次调用上限，DSH_FORM_FILL_MAX_CALLS 未设置或 0 表示不限本地次数，正整数表示自定义上限；修改环境配置后重启 DSH。此限制不代表企查查余额、积分额度或 Host 计费，不能解除上游服务自身限制。

预算按主体和接口能力合并，同一接口多个字段合并计算；含候选检索的能力可能按两次估计。retry 仍先校验完整计划，不能作为预算绕过方式；任务 revision 不能证明之前已有成功查询。

主包 0.2.7，内核和 Provider 仍为 0.2.0。共享内核 executePlan 的直接消费默认上限不变，主包显式传入配置。

## 验证

101 项测试及三包打包检查、配置和原生界面回归通过。合成 101 主体的两字段按 101 次调用执行；显式上限 100 时在 lookup 前阻止。没有为验收查询真实客户或操作生产配置。

## 发布回执

- 代码 77f0a5a8c1367c17d3d12c478ce98d2a8330f3ce，标签 V0.2.7 已推送。
- [自动发布](https://github.com/duhu2000/dsh-form-fill-agent/actions/runs/34085640023) 成功：六组 CI、OIDC、registry 验收通过；首次 README 同步延迟重跑后通过。
- npm latest 与 GitHub Latest 均为 0.2.7，非预发布。
- DSH rc.2 / alpha.2 隔离安装、bundle reconcile、卸载通过，无生产 profile 和端口操作。
