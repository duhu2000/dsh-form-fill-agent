import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { analyzeDocument, buildFillPlan, executePlan, applyChangeSet, serialize, FillError } from 'form-fill-core';
import { createMockProvider, FIELD_CATALOG } from 'qcc-form-fill-provider';

export async function previewBytes(bytes, { provider = createMockProvider(), maxCalls = 100, confirmPaidCalls = false, configuration = {}, selectedFields, signal, onProgress, previousChangeSet, retryOnly } = {}) {
  if (provider.mode !== 'mock' && (provider.mode !== 'qcc' || confirmPaidCalls !== true)) throw new FillError('REAL_PROVIDER_DISABLED', '真实来源需要调用方明确授权');
  const { analysis } = analyzeDocument(bytes, FIELD_CATALOG, configuration);
  if (selectedFields !== undefined) {
    if (!Array.isArray(selectedFields) || new Set(selectedFields).size !== selectedFields.length || selectedFields.some(key=>!FIELD_CATALOG.some(f=>f.key===key&&!f.anchor))) throw new FillError('FIELD_SCOPE','填写字段范围无效');
    analysis.incomplete.push(...analysis.opportunities.filter(o=>!selectedFields.includes(o.field)).map(o=>({...o,reason:'user-excluded'})));
    analysis.opportunities=analysis.opportunities.filter(o=>selectedFields.includes(o.field));
  }
  const plan = buildFillPlan(analysis, provider.capabilities, provider.version);
  const changeSet = await executePlan(plan, provider, { maxCalls, confirmPaidCalls, signal, onProgress:onProgress?p=>onProgress({...p,analysis,plan}):undefined, previousChangeSet, retryOnly });
  return { analysis, plan, changeSet };
}
export async function previewFile(path, options) {
  if (!path.toLowerCase().endsWith('.xlsx')) throw new FillError('NOT_XLSX', '请选择 XLSX 文件');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new FillError('FILE_TOO_LARGE', '需要不超过 8 MiB 的普通 XLSX 文件');
  return previewBytes(await readFile(path), options);
}
export async function writeCopy(inputPath, outputDirectory, preview, confirmation) {
  const input = resolve(inputPath), directory = resolve(outputDirectory);
  // Exclusive directory creation prevents overwrite and simultaneous duplicate writes.
  if (directory === input || dirname(input) === directory) throw new FillError('OUTPUT_PATH', '请选择新的独立输出目录');
  const result = applyChangeSet(await readFile(input), preview.plan, preview.changeSet, { confirmChangeSetId: confirmation });
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const paths = {
    workbook: join(directory, basename(input, '.xlsx') + '-已填副本.xlsx'),
    changes: join(directory, 'changes.json'), incomplete: join(directory, 'incomplete.json'), plan: join(directory, 'plan.json'),
  };
  await writeFile(paths.workbook, result.bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(paths.changes, JSON.stringify({ kind: 'WritebackReport', changeSet: preview.changeSet, appliedChanges: result.changes, outputChecksum: result.checksum }, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(paths.incomplete, JSON.stringify(result.incomplete, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(paths.plan, serialize(preview.plan), { flag: 'wx', mode: 0o600 });
  return { paths, checksum: result.checksum, filled: result.changes.length, incomplete: result.incomplete.length };
}
