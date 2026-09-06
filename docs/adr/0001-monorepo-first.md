# ADR 0001 — 本地 private monorepo

接受方案 2B：三个独立版本包均使用无 scope 的本地临时包名及 private:true，版本 0.1.0-alpha.1。禁止公开发布。根仓库 private:true；共享包通过 exports 限定接口、files 限定 pack 内容。消费方精确 pin 版本。

先抽 CSV 纯函数，后续再迁移 QCC Bridge；不复制两套长期业务实现。新 XLSX 使用原 XML 补丁避免重建文件丢失格式。M1 提供 CLI/本地 Web 演示和 DSH Host 可选路由，不依赖 companion UI 插件。
