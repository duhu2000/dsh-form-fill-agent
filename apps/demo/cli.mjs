import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile } from 'node:fs/promises';
import { previewFile, writeCopy } from 'dsh-form-fill-agent';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [command = 'preview', input = join(root, 'fixtures/xlsx/客户台账.xlsx'), target] = process.argv.slice(2);
try {
  if (command === 'preview') {
    const preview = await previewFile(resolve(input));
    console.log('AI填表 · 合成演示 · 来源 mock · 不收费');
    console.log('预计调用 ' + preview.plan.estimatedCalls + ' 次；可填写 ' + preview.changeSet.changes.length + ' 格；未完成 ' + preview.changeSet.incomplete.length + ' 项');
    console.table(preview.changeSet.changes.map(c => ({ 工作表: c.sheet, 单元格: c.cell, 字段: c.label, 原值: c.oldValue, 拟填值: c.newValue, 来源: c.source })));
    console.table(preview.changeSet.incomplete.map(i => ({ 工作表: i.sheet, 单元格: i.cell ?? '', 原因: i.reason })));
    if (target) { await writeFile(resolve(target), JSON.stringify(preview, null, 2), { flag: 'wx', mode: 0o600 }); console.log('预览已保存。检查后使用 write 命令及确认摘要：' + preview.changeSet.changeSetId); }
  } else if (command === 'write') {
    const [previewPath, confirmation] = process.argv.slice(5);
    if (!target || !previewPath || !confirmation) throw new Error('用法：write 输入.xlsx 新输出目录 预览.json 确认摘要');
    const preview = JSON.parse(await readFile(previewPath));
    console.log(JSON.stringify(await writeCopy(input, target, preview, confirmation), null, 2));
  } else throw new Error('命令只支持 preview / write');
} catch (error) { console.error(error.code ?? 'DEMO_ERROR', error.message); process.exitCode = 1; }
