import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { analyzeDocument, buildFillPlan, executePlan, applyChangeSet, deserialize, serialize, parseWorkbook } from 'form-fill-core';
import { readZip, writeZip, LIMITS } from '../packages/form-fill-core/lib/zip.js';
import { isBlank } from '../packages/form-fill-core/lib/workbook.js';
import { previewBytes, previewFile, writeCopy, apply } from 'dsh-form-fill-agent';
import { createMockProvider, FIELD_CATALOG } from 'qcc-form-fill-provider';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';

const fixture = name => new URL('../fixtures/xlsx/' + name + '.xlsx', import.meta.url);
function edited(bytes, name, edit) { const entries = readZip(bytes); entries.set(name, Buffer.from(edit(entries.get(name)?.toString() ?? ''))); return writeZip(entries); }
const simple = () => fixtureBytes('合成模板', ['企业名称', '法定代表人'], [['合成客户甲有限公司', '']], { title: false });

for (const [name, expected] of [['客户台账', ['B4','C4','D4','E4','B5','D5']], ['供应商准入表', ['B4','C4','D4','E4']], ['合同主体信息表', ['C4','D4','E4','C5','D5','E5']]]) {
  test(name + ': preview, confirmation, new copy, immutable cells and second-run idempotence', async () => {
    const bytes = await readFile(fixture(name)), provider = createMockProvider();
    const preview = await previewBytes(bytes, { provider });
    assert.deepEqual(preview.changeSet.changes.map(c => c.cell), expected);
    assert.equal(preview.analysis.tables[0].headerRow, 3);
    assert.equal(provider.calls, preview.plan.estimatedCalls);
    assert.equal(preview.plan.paidCalls, 0);
    const out = applyChangeSet(bytes, preview.plan, preview.changeSet, { confirmChangeSetId: preview.changeSet.changeSetId });
    const before = parseWorkbook(bytes), after = parseWorkbook(out.bytes);
    for (const sheet of before.sheets) for (const cell of Object.values(sheet.cells)) {
      const change = out.changes.find(c => c.sheet === sheet.name && c.cell === cell.ref);
      const updated = after.sheets.find(s => s.name === sheet.name).cells[cell.ref];
      if (!change) assert.deepEqual(updated, cell);
      else { assert.equal(updated.value, change.newValue); assert.equal(updated.style, cell.style); }
    }
    for (const [entry, value] of before.entries) if (!out.changes.some(c => before.sheets.find(s => s.name === c.sheet)?.path === entry)) assert.deepEqual(after.entries.get(entry), value, 'Unedited OOXML entry preserved: ' + entry);
    const workbook = XLSX.read(out.bytes, { type: 'buffer', cellStyles: true });
    assert.deepEqual(workbook.SheetNames, before.sheets.map(s => s.name));
    for (const change of out.changes) assert.equal(workbook.Sheets[change.sheet][change.cell].v, change.newValue);
    assert.equal((await previewBytes(out.bytes)).changeSet.changes.length, 0);
    const parent = await mkdtemp(join(tmpdir(), 'form-fill-copy-'));
    const result = await writeCopy(fileURLToPath(fixture(name)), join(parent, 'result'), preview, preview.changeSet.changeSetId);
    assert.equal(result.filled, expected.length);
    assert.deepEqual(await readFile(fixture(name)), bytes);
    assert.equal(JSON.parse(await readFile(result.paths.incomplete)).length, preview.changeSet.incomplete.length);
    await assert.rejects(writeCopy(fileURLToPath(fixture(name)), join(parent, 'result'), preview, preview.changeSet.changeSetId), { code: 'EEXIST' });
  });
}
test('golden preview models are stable for all three fixtures', async () => {
  for (const name of ['客户台账','供应商准入表','合同主体信息表']) {
    const expected = JSON.parse(await readFile(new URL('../fixtures/expected/' + name + '.json', import.meta.url)));
    assert.deepEqual(await previewFile(fileURLToPath(fixture(name))), expected);
  }
});
test('empty workbook, blank row and missing anchor do not invent records', async () => {
  for (const records of [[], [['','']], [['','待填写']]]) {
    const p = await previewBytes(fixtureBytes('空表', ['企业名称','法定代表人'], records, { title: false }));
    assert.equal(p.changeSet.changes.length, 0);
  }
});
test('duplicate semantic headers and low-confidence mappings are withheld', async () => {
  const p = await previewBytes(fixtureBytes('重复', ['企业名称','法人','法定代表人'], [['合成客户甲有限公司','','']], { title: false }));
  assert.equal(p.plan.calls.length, 0);
  assert.ok(p.changeSet.incomplete.some(i => i.reason === 'ambiguous-mapping'));
});
test('title merge preserved, record merge withheld', async () => {
  const bytes = edited(simple(), 'xl/worksheets/sheet1.xml', s => s.replace('</worksheet>', '<mergeCells count="1"><mergeCell ref="B2:C2"/></mergeCells></worksheet>'));
  const p = await previewBytes(bytes);
  assert.equal(p.changeSet.changes.length, 0);
  assert.ok(p.changeSet.incomplete.some(i => i.reason === 'hidden-or-merged'));
});
test('hidden rows and columns are never filled', async () => {
  for (const bytes of [
    edited(simple(), 'xl/worksheets/sheet1.xml', s => s.replace('<row r="2"', '<row hidden="1" r="2"')),
    edited(simple(), 'xl/worksheets/sheet1.xml', s => s.replace('min="2" max="2"', 'hidden="1" min="2" max="2"')),
  ]) assert.equal((await previewBytes(bytes)).changeSet.changes.length, 0);
});
test('whitespace is blank; placeholders, zero, false, formula and error are preserved', async () => {
  assert.equal(isBlank({ formula: true, type: 'str', value: '' }), false);
  assert.equal(isBlank({ type: 'e', value: '' }), false);
  for (const value of ['待填','—','0','false']) assert.equal((await previewBytes(fixtureBytes('占位符', ['企业名称','法定代表人'], [['合成客户甲有限公司',value]], { title: false }))).changeSet.changes.length, 0);
  assert.equal((await previewBytes(fixtureBytes('空格', ['企业名称','法定代表人'], [['合成客户甲有限公司','  ']], { title: false }))).changeSet.changes.length, 1);
});
test('missing XML cell is inserted in ascending column order', async () => {
  const bytes = edited(simple(), 'xl/worksheets/sheet1.xml', s => s.replace(/<c r="B2"[\s\S]*?<\/c>/, ''));
  const p = await previewBytes(bytes);
  const out = applyChangeSet(bytes, p.plan, p.changeSet, { confirmChangeSetId: p.changeSet.changeSetId });
  assert.equal(parseWorkbook(out.bytes).sheets[0].cells.B2.value, '合成人员甲');
});
test('schema serialization round trip and unknown schema rejection', async () => {
  const p = await previewBytes(simple());
  for (const value of [p.plan, p.changeSet]) assert.deepEqual(deserialize(serialize(value)), value);
  assert.throws(() => deserialize('{"kind":"ChangeSet","schemaVersion":99}'), { code: 'CHANGESET_INVALID' });
});
test('write requires matching confirmation; stale input and tampering rejected', async () => {
  const bytes = simple(), p = await previewBytes(bytes);
  assert.throws(() => applyChangeSet(bytes, p.plan, p.changeSet), { code: 'WRITE_CONFIRMATION_REQUIRED' });
  assert.throws(() => applyChangeSet(edited(bytes, 'xl/worksheets/sheet1.xml', s => s.replace('合成客户甲', '合成客户乙')), p.plan, p.changeSet, { confirmChangeSetId: p.changeSet.changeSetId }), { code: 'STALE_DOCUMENT' });
  const changed = structuredClone(p.changeSet); changed.changes[0].newValue = 'tampered';
  assert.throws(() => applyChangeSet(bytes, p.plan, changed, { confirmChangeSetId: changed.changeSetId }), { code: 'CHANGESET_INVALID' });
});
test('paid confirmation and budget gates run before Provider', async () => {
  const { analysis } = analyzeDocument(simple(), FIELD_CATALOG), provider = createMockProvider();
  const plan = buildFillPlan(analysis, provider.capabilities.map(c => ({ ...c, paid: true })), provider.version);
  await assert.rejects(executePlan(plan, provider), { code: 'PAID_CONFIRMATION_REQUIRED' });
  await assert.rejects(executePlan(plan, provider, { confirmPaidCalls: true, maxCalls: 0 }), { code: 'BUDGET_EXCEEDED' });
  assert.equal(provider.calls, 0);
  assert.equal((await executePlan(plan, provider, { confirmPaidCalls: true })).changes.length, 1);
});
test('real Provider is disabled at product boundary', async () => {
  await assert.rejects(previewBytes(simple(), { provider: { mode: 'real' } }), { code: 'REAL_PROVIDER_DISABLED' });
});
for (const [label, value, reason] of [
  ['formula injection', { value: '=HYPERLINK("https://invalid")', confidence: 1, source: 'mock://test', acquiredAt: '2026-09-06' }, 'unsafe-value'],
  ['missing provenance', { value: '示例', confidence: 1 }, 'missing-provenance'],
  ['low confidence', { value: '示例', confidence: .5 }, 'low-confidence'],
  ['object value', { value: { raw: 'excluded' }, confidence: 1, source: 'mock://test', acquiredAt: '2026-09-06' }, 'invalid-value'],
]) test(label + ' remains incomplete', async () => {
  const p = createMockProvider(); p.lookup = async () => ({ status: 'exact', values: { legal_person: value } });
  const result = await previewBytes(simple(), { provider: p });
  assert.equal(result.changeSet.changes.length, 0);
  assert.equal(result.changeSet.incomplete[0].reason, reason);
});
test('provider timeout/failure, ambiguous and missing match do not fabricate values', async () => {
  const p = createMockProvider(); p.lookup = async () => { throw new Error('raw upstream should not leak'); };
  const result = await previewBytes(simple(), { provider: p });
  assert.equal(result.changeSet.incomplete[0].reason, 'provider-error');
  assert.ok(!JSON.stringify(result).includes('raw upstream'));
  for (const name of ['合成多候选有限公司','合成未知有限公司']) assert.equal((await previewBytes(fixtureBytes('缺失', ['企业名称','法定代表人'], [[name,'']], { title: false }))).changeSet.changes.length, 0);
});
for (const [label, name, transform, code] of [
  ['macro', 'xl/vbaProject.bin', () => 'synthetic', 'UNSUPPORTED_STRUCTURE'],
  ['path traversal', '../escape.xml', () => 'synthetic', 'ZIP_PATH'],
  ['DOCTYPE', 'xl/workbook.xml', s => '<!DOCTYPE workbook [<!ENTITY x "x">]>' + s, 'UNSAFE_XML'],
  ['broken XML', 'xl/workbook.xml', () => '<workbook>', 'BAD_XML'],
  ['deep XML', 'xl/workbook.xml', () => '<a>'.repeat(129) + '</a>'.repeat(129), 'XML_DEPTH'],
  ['external link', 'xl/_rels/workbook.xml.rels', s => s.replace('Target="worksheets/sheet1.xml"', 'TargetMode="External" Target="https://invalid/"'), 'EXTERNAL_LINK'],
  ['protection', 'xl/worksheets/sheet1.xml', s => s.replace('</worksheet>', '<sheetProtection sheet="1"/></worksheet>'), 'UNSUPPORTED_STRUCTURE'],
  ['validation', 'xl/worksheets/sheet1.xml', s => s.replace('</worksheet>', '<dataValidations count="0"/></worksheet>'), 'UNSUPPORTED_STRUCTURE'],
  ['formula cache', 'xl/worksheets/sheet1.xml', s => s.replace('<c r="B2"', '<c r="B2"').replace('<row r="2" ht="24" customHeight="1">', '<row r="2" ht="24" customHeight="1"><c r="C2" t="str"><f>""</f><v></v></c>'), 'UNSUPPORTED_FORMULA'],
  ['conditional format', 'xl/worksheets/sheet1.xml', s => s.replace('</worksheet>', '<conditionalFormatting sqref="B2"/></worksheet>'), 'UNSUPPORTED_STRUCTURE'],
  ['huge dimension', 'xl/worksheets/sheet1.xml', s => s.replace('A1:B2','A1:XFD1048576'), 'SHEET_LIMIT'],
  ['duplicate cell', 'xl/worksheets/sheet1.xml', s => s.replace('</row>', '<c r="A1"><v>1</v></c></row>'), 'CELL_REFERENCE'],
]) test('security: reject ' + label, () => assert.throws(() => parseWorkbook(edited(simple(), name, transform)), { code }));
test('bad magic, encryption, oversized input, CRC and central directory mismatch are rejected', () => {
  assert.throws(() => parseWorkbook(Buffer.from('not-a-zip')), { code: 'NOT_XLSX' });
  assert.throws(() => parseWorkbook(Buffer.alloc(LIMITS.bytes + 1)), { code: 'FILE_TOO_LARGE' });
  const corrupt = simple(); corrupt[100] ^= 1;
  assert.throws(() => readZip(corrupt), { code: 'BAD_ZIP' });
  const bytes = simple(), eocd = bytes.length - 22, cd = bytes.readUInt32LE(eocd + 16);
  bytes.writeUInt16LE(0x801, cd + 8);
  assert.throws(() => readZip(bytes), { code: 'ZIP_UNSUPPORTED' });
});
test('zip bomb declared expansion blocked before inflate', () => {
  const bytes = simple(), cd = bytes.readUInt32LE(bytes.length - 6);
  bytes.writeUInt32LE(LIMITS.entryBytes + 1, cd + 24);
  assert.throws(() => readZip(bytes), { code: 'ZIP_LIMIT' });
});
test('DSH optional UI absent: module loads, Host health route registers/disposes', async () => {
  const routes = [], effects = [];
  apply({ inject: (_, fn) => fn({ webServer: { port: 43260, register: route => { routes.push(route); return () => routes.pop(); } } }), effect: fn => effects.push(fn()) });
  assert.equal(routes.length, 1);
  let status, body;
  await routes[0].handler({ url: '/form-fill/health', method: 'GET', headers: { host: '127.0.0.1:43260' } }, { writeHead: s => { status = s; }, end: s => { body = s; } });
  assert.equal(status, 200);
  assert.equal(JSON.parse(body).companionRequired, false);
  effects[0](); assert.equal(routes.length, 0);
  assert.doesNotThrow(() => apply({ inject() {} }));
});
