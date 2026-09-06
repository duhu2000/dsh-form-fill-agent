# qcc-form-fill-provider

AI填表的企查查工商 Provider，包含六类字段目录、合成演示 Provider、由调用方授权 transport 的 QCC Provider。

## 安装

```sh
npm install qcc-form-fill-provider
```

Node.js 22 或以上。导出 FIELD_CATALOG、createMockProvider、createQccProvider。真实 Provider 由调用方注入 callTool，不包含访问凭据。

真实查询要求完整登记名称或信用代码。若返回主体与查询主体不一致，仅返回候选身份，不返回可填写事实；人工选择后需发起新的精确核验。此包没有模糊检索或多候选搜索工具。

六类字段：信用代码、法定代表人、成立日期、注册地址、登记状态、登记机关。所有事实都带来源和获取时间，未返回字段不猜测。

[源码与使用说明](https://github.com/duhu2000/dsh-form-fill-agent) · [问题反馈](https://github.com/duhu2000/dsh-form-fill-agent/issues)

MIT License.
