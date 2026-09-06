# 0.1.0-alpha.9 次日发布清单

今晚仅 commit / push / tag，未执行 npm publish。alpha.8 是中间验证 tag，次日直接发布最终 alpha.9 三包。GitHub Latest 保持已发布 alpha.7，避免向用户推荐 registry 中不存在的版本。

运行代码：e4a17ad7c99be983d3d84c5fe1df5cee448e54c9；tag：v0.1.0-alpha.9；CI 34048662436 六组成功。

## 已打包文件 SHA-256

| 文件（artifacts/） | SHA-256 |
|---|---|
| form-fill-core-0.1.0-alpha.9.tgz | 6068030f39b0c76eb1872b17c469d2a1c3f7e98434b3d1f82001f34074541450 |
| qcc-form-fill-provider-0.1.0-alpha.9.tgz | f7da466166274137202138134e273062b608c66dda6feb000c2e9f579b8ac1f9 |
| dsh-form-fill-agent-0.1.0-alpha.9.tgz | bd138e8e830c1154ac93ad5f294b9f9eb875e063edbb2a75f99b74cd0b1bd607 |

若重新打包改变文件，先重新验证哈希、内容和安装回归，不使用本表误报完整性。

## 等待所有者认证后执行

```sh
npm publish artifacts/form-fill-core-0.1.0-alpha.9.tgz --access public --tag latest --registry=https://registry.npmjs.org/
npm publish artifacts/qcc-form-fill-provider-0.1.0-alpha.9.tgz --access public --tag latest --registry=https://registry.npmjs.org/
npm publish artifacts/dsh-form-fill-agent-0.1.0-alpha.9.tgz --access public --tag latest --registry=https://registry.npmjs.org/
node scripts/registry-smoke.mjs
```

认证通过一次不代表后三次操作都免认证。遇到已发布版本先查 registry 完整性，不重复发布；禁止覆盖不可变 npm 版本。

发布后三包 integrity、README、三模板独立安装与双宿主加载验证通过后，再创建标题仅为 **0.1.0-alpha.9** 的 GitHub Release，并按所有者既有偏好取消 Pre-release、设 Latest。原 alpha.8 tag 不移动、不改名。

市场 #4487 仍须年龄门禁与维护者审核合并，不能用 npm 或 GitHub 发布替代上架验收。
