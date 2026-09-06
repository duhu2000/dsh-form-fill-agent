import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewFile, writeCopy } from 'dsh-form-fill-agent';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(root, 'artifacts/demo'), { recursive: true });
const output = await mkdtemp(join(root, 'artifacts/demo/run-'));
for (const name of ['客户台账','供应商准入表','合同主体信息表']) {
  const input = join(root,'fixtures/xlsx',name+'.xlsx');
  const preview = await previewFile(input);
  console.log(JSON.stringify({ name, estimatedCalls: preview.plan.estimatedCalls, previewCells: preview.changeSet.changes.map(c=>c.cell), incomplete: preview.changeSet.incomplete.length }));
  if (process.argv.includes('--confirm-synthetic')) {
    const result = await writeCopy(input, join(output,name), preview, preview.changeSet.changeSetId);
    console.log(JSON.stringify({ name, ...result }));
  }
}
if (!process.argv.includes('--confirm-synthetic')) console.log('Preview only. Pass --confirm-synthetic to write new synthetic demonstration copies.');
