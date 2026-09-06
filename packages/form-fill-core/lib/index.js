import { digest, parseWorkbook, isBlank, address, inRange, writeWorkbook } from './workbook.js';
import { fail, FillError } from './zip.js';
export { parseWorkbook, FillError };
export const CORE_VERSION = '0.1.0-alpha.1';
export const SCHEMA_VERSION = 1;
const normalize = value => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
const idFor = value => digest(Buffer.from(JSON.stringify(value)));
const versions = { coreVersion: CORE_VERSION, rulesetVersion: '1', documentSchemaVersion: SCHEMA_VERSION };
export function mapFields(headers, catalog) {
  return headers.map(({ cell, value, column }) => {
    const candidates = catalog.filter(field => [field.label, field.key, ...(field.aliases ?? [])].some(alias => normalize(alias) === normalize(value)));
    return { cell, column, label: value, field: candidates.length === 1 ? candidates[0].key : null, confidence: candidates.length === 1 ? 1 : 0, evidence: candidates.length === 1 ? 'exact-alias' : candidates.length ? 'ambiguous-alias' : 'unknown-field' };
  });
}
export function analyzeDocument(bytes, catalog) {
  if (!Array.isArray(catalog) || new Set(catalog.map(f => f.key)).size !== catalog.length) fail('FIELD_CATALOG', '字段目录无效');
  const document = parseWorkbook(bytes), opportunities = [], incomplete = [], tables = [];
  for (const sheet of document.sheets) {
    if (sheet.hidden) { incomplete.push({ sheet: sheet.name, reason: 'hidden-sheet', message: '隐藏工作表未处理' }); continue; }
    const candidates = [];
    for (const row of sheet.rows.filter(r => !r.hidden).slice(0, 30)) {
      const headers = Object.values(sheet.cells).filter(c => c.row === row.number && !c.hidden && !c.formula && c.type !== 'e' && c.value.trim()).map(c => ({ cell: c.ref, column: c.column, value: c.value }));
      const mappings = mapFields(headers, catalog);
      const mapped = mappings.filter(m => m.field);
      if (mapped.length >= 2 && mapped.some(m => catalog.find(f => f.key === m.field)?.anchor)) candidates.push({ row: row.number, mappings, score: mapped.length });
    }
    candidates.sort((a, b) => b.score - a.score || a.row - b.row);
    const header = candidates[0];
    if (!header) { incomplete.push({ sheet: sheet.name, reason: 'header-not-found', message: '未识别到可靠表头及主体锚点' }); continue; }
    if (candidates.length > 1) { incomplete.push({ sheet: sheet.name, reason: 'multiple-tables', message: '疑似多个表头，需先拆分区域' }); continue; }
    const fields = header.mappings.filter(m => m.field).map(m => m.field);
    if (new Set(fields).size !== fields.length || header.mappings.some(m => m.evidence === 'ambiguous-alias')) {
      incomplete.push({ sheet: sheet.name, reason: 'ambiguous-mapping', message: '重复或冲突字段需人工选择' }); continue;
    }
    const anchors = header.mappings.filter(m => catalog.find(f => f.key === m.field)?.anchor);
    tables.push({ sheet: sheet.name, headerRow: header.row, mappings: header.mappings, anchors: anchors.map(a => a.field) });
    for (const row of sheet.rows.filter(r => r.number > header.row)) {
      const recordCells = Object.values(sheet.cells).filter(c => c.row === row.number);
      if (!recordCells.some(c => c.value.trim() || c.formula)) continue;
      if (row.hidden) { incomplete.push({ sheet: sheet.name, row: row.number, reason: 'hidden-row' }); continue; }
      const anchor = {};
      for (const mapping of anchors) {
        const c = sheet.cells[address(row.number, mapping.column)];
        if (c && !c.hidden && !c.formula && c.type !== 'e' && c.value.trim()) anchor[mapping.field] = c.value.trim();
      }
      if (!Object.keys(anchor).length) { incomplete.push({ sheet: sheet.name, row: row.number, reason: 'missing-anchor' }); continue; }
      for (const mapping of header.mappings) {
        const ref = address(row.number, mapping.column), cell = sheet.cells[ref];
        const location = { sheet: sheet.name, row: row.number, cell: ref, field: mapping.field, label: mapping.label };
        if (cell?.formula || cell?.type === 'e') { incomplete.push({ ...location, reason: cell.formula ? 'formula-preserved' : 'error-cell' }); continue; }
        if (!isBlank(cell)) {
          if (/^(?:待填|待补充|待填写|—|-|N\/A|\{\{.*\}\})$/i.test(cell.value.trim())) incomplete.push({ ...location, reason: 'placeholder-needs-confirmation' });
          continue;
        }
        if (cell?.hidden || sheet.hiddenColumns.some(([a, b]) => mapping.column >= a && mapping.column <= b) || sheet.merges.some(r => inRange(row.number, mapping.column, r) || inRange(header.row, mapping.column, r))) { incomplete.push({ ...location, reason: 'hidden-or-merged' }); continue; }
        if (!mapping.field) { incomplete.push({ ...location, reason: 'unknown-field' }); continue; }
        if (catalog.find(f => f.key === mapping.field)?.anchor) { incomplete.push({ ...location, reason: 'missing-anchor-field' }); continue; }
        const opportunity = { kind: 'FillOpportunity', ...location, anchor, oldValue: cell?.value ?? '', confidence: mapping.confidence, evidence: mapping.evidence };
        opportunities.push({ id: idFor([document.documentHash, sheet.name, ref]), ...opportunity });
      }
    }
  }
  return { document, analysis: { kind: 'Analysis', schemaVersion: SCHEMA_VERSION, ...versions, documentHash: document.documentHash, sheets: document.sheets.map(s => ({ name: s.name, hidden: s.hidden })), tables, opportunities, incomplete } };
}
export function buildFillPlan(analysis, capabilities, providerVersion) {
  const calls = [], eligible = [], incomplete = [...analysis.incomplete];
  for (const item of analysis.opportunities) {
    const sources = capabilities.filter(c => c.fields.includes(item.field));
    if (sources.length !== 1) { incomplete.push({ ...item, reason: sources.length ? 'ambiguous-source' : 'provider-unavailable' }); continue; }
    const capability = sources[0];
    const key = idFor([item.anchor, capability.id]);
    let call = calls.find(c => c.id === key);
    if (!call) { call = { id: key, anchor: item.anchor, capability: capability.id, paid: capability.paid === true, fields: [] }; calls.push(call); }
    if (!call.fields.includes(item.field)) call.fields.push(item.field);
    eligible.push({ ...item, callId: key });
  }
  const body = { kind: 'FillPlan', schemaVersion: SCHEMA_VERSION, ...versions, providerVersion, documentHash: analysis.documentHash, policy: 'fill-blanks-only', estimatedCalls: calls.length, paidCalls: calls.filter(c => c.paid).length, calls, opportunities: eligible, incomplete };
  return { ...body, planId: idFor(body) };
}
export function assertPlan(plan) {
  const { planId, ...body } = plan ?? {};
  if (plan?.kind !== 'FillPlan' || plan.schemaVersion !== 1 || plan.policy !== 'fill-blanks-only' || idFor(body) !== planId) fail('PLAN_INVALID', '填写计划无效或已被修改');
}
export async function executePlan(plan, provider, options = {}) {
  assertPlan(plan);
  if (provider.version !== plan.providerVersion) fail('PROVIDER_VERSION', '数据来源版本已变化');
  if (plan.estimatedCalls > (options.maxCalls ?? 100)) fail('BUDGET_EXCEEDED', '预计调用量超出预算');
  if (plan.paidCalls && options.confirmPaidCalls !== true) fail('PAID_CONFIRMATION_REQUIRED', '付费调用需要明确确认');
  const results = new Map();
  for (const call of plan.calls) {
    try { results.set(call.id, await provider.lookup(call)); }
    catch { results.set(call.id, { status: 'error', code: 'provider-error' }); }
  }
  const changes = [], incomplete = [...plan.incomplete];
  for (const item of plan.opportunities) {
    const result = results.get(item.callId), candidate = result?.values?.[item.field];
    let reason;
    if (result?.status !== 'exact') reason = result?.status === 'ambiguous' ? 'candidate-review-required' : result?.status === 'not-found' ? 'no-match' : 'provider-error';
    else if (!candidate || candidate.value === null || candidate.value === undefined || String(candidate.value).trim() === '') reason = 'no-data';
    else if (candidate.confidence < 0.95 || !Number.isFinite(candidate.confidence)) reason = 'low-confidence';
    else if (!candidate.source || typeof candidate.source !== 'string' || !candidate.acquiredAt || !Number.isFinite(Date.parse(candidate.acquiredAt))) reason = 'missing-provenance';
    else if (!['string', 'number', 'boolean'].includes(typeof candidate.value) || (typeof candidate.value === 'number' && !Number.isFinite(candidate.value))) reason = 'invalid-value';
    else if (/^[\s]*[=+@-]/.test(String(candidate.value)) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(candidate.value)) || String(candidate.value).length > 32767) reason = 'unsafe-value';
    if (reason) { incomplete.push({ ...item, reason }); continue; }
    changes.push({ id: item.id, sheet: item.sheet, cell: item.cell, field: item.field, label: item.label, anchor: item.anchor, oldValue: item.oldValue, newValue: String(candidate.value), source: candidate.source, acquiredAt: candidate.acquiredAt, confidence: candidate.confidence, changeType: 'fill-blank', basis: item.evidence, status: 'preview' });
  }
  const body = { kind: 'ChangeSet', schemaVersion: 1, ...versions, providerVersion: provider.version, documentHash: plan.documentHash, planId: plan.planId, changes, incomplete };
  return { ...body, changeSetId: idFor(body) };
}
export function assertChangeSet(changeSet) {
  const { changeSetId, ...body } = changeSet ?? {};
  if (changeSet?.kind !== 'ChangeSet' || changeSet.schemaVersion !== 1 || idFor(body) !== changeSetId) fail('CHANGESET_INVALID', '变更清单版本无效或内容已变化');
}
export function serialize(value) {
  if (value.kind === 'FillPlan') assertPlan(value); else if (value.kind === 'ChangeSet') assertChangeSet(value); else fail('SCHEMA_UNSUPPORTED', '不支持的序列化模型');
  return JSON.stringify(value, null, 2);
}
export function deserialize(value) {
  let result; try { result = JSON.parse(value); } catch { fail('BAD_JSON', 'JSON 无效'); }
  serialize(result); return result;
}
export function applyChangeSet(input, plan, changeSet, options = {}) {
  assertPlan(plan); assertChangeSet(changeSet);
  if (options.confirmChangeSetId !== changeSet.changeSetId) fail('WRITE_CONFIRMATION_REQUIRED', '请确认当前单元格填写预览');
  const document = parseWorkbook(input);
  if (document.documentHash !== plan.documentHash || changeSet.documentHash !== plan.documentHash || changeSet.planId !== plan.planId) fail('STALE_DOCUMENT', '原文件或填写计划已变化，请重新预览');
  for (const change of changeSet.changes) {
    const opportunity = plan.opportunities.find(o => o.id === change.id);
    if (!opportunity || opportunity.sheet !== change.sheet || opportunity.cell !== change.cell || opportunity.field !== change.field || opportunity.oldValue !== change.oldValue || change.changeType !== 'fill-blank') fail('CHANGE_TARGET', '变更超出已确认计划');
  }
  const bytes = writeWorkbook(document, changeSet.changes);
  return { kind: 'WritebackResult', bytes, checksum: digest(bytes), changes: changeSet.changes.map(c => ({ ...c, status: 'applied' })), incomplete: changeSet.incomplete };
}
