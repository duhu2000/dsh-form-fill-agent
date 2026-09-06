# qcc-form-fill-provider

AI填表的企查查工商 Provider，包含26 个工商字段目录、合成演示 Provider、由调用方授权 transport 的 QCC Provider。

## 安装

```sh
npm install qcc-form-fill-provider
```

Node.js 22 或以上。导出 FIELD_CATALOG、createMockProvider、createQccProvider。真实 Provider 由调用方注入 callTool，不包含访问凭据。

真实查询要求完整登记名称或信用代码。若返回主体与查询主体不一致，仅返回候选身份，不返回可填写事实；人工选择后需发起新的精确核验。enableEntitySearch=true 时使用 get_company_by_query 检索简称或未匹配名称；候选必须人工确认，最坏按两次调用估算。宿主缺少检索工具时可保持关闭并人工核验。

支持 26 个工商字段，包括信用代码、法定代表人、成立日期、注册地址、登记状态、登记机关，以及资本、税务标识、类型、行业、经营范围和参保人数等。所有事实都带来源和获取时间，未返回字段不猜测。

[源码与使用说明](https://github.com/duhu2000/dsh-form-fill-agent) · [问题反馈](https://github.com/duhu2000/dsh-form-fill-agent/issues)

MIT License.
