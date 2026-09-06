import { digest, parseWorkbook, isBlank, address, inRange, writeWorkbook } from './workbook.js';
import { fail, FillError } from './zip.js';
export { parseWorkbook, FillError };
export const CORE_VERSION = '0.1.0-alpha.8';
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
export function analyzeDocument(bytes, catalog, options = {}) {
  if (!Array.isArray(catalog) || new Set(catalog.map(f => f.key)).size !== catalog.length) fail('FIELD_CATALOG', '字段目录无效');
  const document = parseWorkbook(bytes), opportunities = [], incomplete = [], tables = [];
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['sheets','headers','mappings','anchors'].includes(k))) fail('CONFIG_INVALID', '字段设置格式无效');
  const selected = options.sheets ?? document.sheets.filter(s => !s.hidden).map(s => s.name);
  if (!Array.isArray(selected) || (!selected.length && options.sheets !== undefined) || new Set(selected).size !== selected.length || selected.some(name => !document.sheets.some(s => s.name === name && !s.hidden))) fail('CONFIG_INVALID', '请选择可见工作表');
  for (const key of ['headers','mappings','anchors']) if (options[key] !== undefined && (!Array.isArray(options[key]) || options[key].length > 10000)) fail('CONFIG_INVALID', '设置列表无效');
  for (const [key, identity] of [['headers', x => x.sheet], ['mappings', x => x.sheet+':'+x.column], ['anchors', x => x.sheet+':'+x.row]]) {
    const list = options[key] ?? [];
    if (list.some(x => !x || !selected.includes(x.sheet)) || new Set(list.map(identity)).size !== list.length) fail('CONFIG_INVALID', '重复或无效的设置位置');
  }
  for (const x of options.headers ?? []) if (!Number.isInteger(x.row) || !document.sheets.find(s => s.name === x.sheet).rows.some(row => row.number === x.row && !row.hidden)) fail('CONFIG_INVALID', '表头行无效');
  for (const x of options.mappings ?? []) if (!Number.isInteger(x.column) || x.column < 1 || x.column > 128 || (x.field !== null && !catalog.some(f => f.key === x.field))) fail('CONFIG_INVALID', '字段映射无效');
  for (const x of options.anchors ?? []) if (!Number.isInteger(x.row) || !document.sheets.find(s => s.name === x.sheet).rows.some(row => row.number === x.row && !row.hidden) || typeof x.value !== 'string' || !x.value.trim() || x.value.length > 256 || /[\x00-\x1f]/.test(x.value)) fail('CONFIG_INVALID', '主体确认无效');
  for (const sheet of document.sheets) {
    const cellsByRow=new Map();for(const cell of Object.values(sheet.cells)){if(!cellsByRow.has(cell.row))cellsByRow.set(cell.row,[]);cellsByRow.get(cell.row).push(cell)}
    if (sheet.hidden) { incomplete.push({ sheet: sheet.name, reason: 'hidden-sheet', message: '隐藏工作表未处理' }); continue; }
    if (!selected.includes(sheet.name)) { incomplete.push({ sheet: sheet.name, reason: 'sheet-excluded' }); continue; }
    const explicitHeader = options.headers?.find(x => x.sheet === sheet.name);
    const candidates = [];
    for (const row of (explicitHeader ? sheet.rows.filter(r => r.number === explicitHeader.row) : sheet.rows.filter(r => !r.hidden).slice(0, 30))) {
      const headers = (cellsByRow.get(row.number)||[]).filter(c => !c.hidden && !c.formula && c.type !== 'e' && c.value.trim()).map(c => ({ cell: c.ref, column: c.column, value: c.value }));
      const mappings = mapFields(headers, catalog);
      for (const override of options.mappings?.filter(x => x.sheet === sheet.name) ?? []) {
        const mapping = mappings.find(m => m.column === override.column);
        if (!mapping) { if (explicitHeader) fail('CONFIG_INVALID', '映射位置必须是已有表头'); continue; }
        Object.assign(mapping, { field: override.field, confidence: override.field ? 1 : 0, evidence: 'user-mapping' });
      }
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
      const recordCells = cellsByRow.get(row.number)||[];
      if (!recordCells.some(c => c.value.trim() || c.formula)) continue;
      if (row.hidden) { incomplete.push({ sheet: sheet.name, row: row.number, reason: 'hidden-row' }); continue; }
      const anchor = {};
      for (const mapping of anchors) {
        const c = sheet.cells[address(row.number, mapping.column)];
        if (c && !c.hidden && !c.formula && c.type !== 'e' && c.value.trim()) anchor[mapping.field] = c.value.trim();
      }
      const selection = options.anchors?.find(x => x.sheet === sheet.name && x.row === row.number);
      if (selection) {
        if (anchors.length !== 1) fail('CONFIG_INVALID', '主体确认需要唯一主体列');
        anchor[anchors[0].field] = selection.value.trim();
      }
      if (!Object.keys(anchor).length) { incomplete.push({ sheet: sheet.name, row: row.number, reason: 'missing-anchor' }); continue; }
      for (const mapping of header.mappings) {
        const ref = address(row.number, mapping.column), cell = sheet.cells[ref];
        const location = { sheet: sheet.name, row: row.number, cell: ref, field: mapping.field, label: mapping.label };
        if((sheet.readOnlyRanges||[]).some(r=>inRange(row.number,mapping.column,r))){incomplete.push({...location,reason:'protected-source-range'});continue;}
        if (cell?.formula || cell?.type === 'e') { incomplete.push({ ...location, reason: cell.formula ? 'formula-preserved' : 'error-cell' }); continue; }
        if (!isBlank(cell)) {
          if (/^(?:待填|待补充|待填写|—|-|N\/A|\{\{.*\}\})$/i.test(cell.value.trim())) incomplete.push({ ...location, reason: 'placeholder-needs-confirmation' });
          continue;
        }
        if (cell?.hidden || sheet.hiddenColumns.some(([a, b]) => mapping.column >= a && mapping.column <= b) || sheet.merges.some(r => inRange(row.number, mapping.column, r) || inRange(header.row, mapping.column, r))) { incomplete.push({ ...location, reason: 'hidden-or-merged' }); continue; }
        if (!mapping.field) { incomplete.push({ ...location, reason: mapping.evidence === 'user-mapping' ? 'user-excluded' : 'unknown-field' }); continue; }
        if (catalog.find(f => f.key === mapping.field)?.anchor) { incomplete.push({ ...location, reason: 'missing-anchor-field' }); continue; }
        const opportunity = { kind: 'FillOpportunity', ...location, anchor, oldValue: cell?.value ?? '', confidence: mapping.confidence, evidence: mapping.evidence };
        const rules = (sheet.validations ?? []).filter(rule => rule.ranges.some(r => inRange(row.number, mapping.column, r)));
        if (rules.length) opportunity.allowedValues = rules.reduce((values, rule) => values.filter(value => rule.values.includes(value)), rules[0].values);
        opportunities.push({ id: idFor([document.documentHash, sheet.name, ref]), ...opportunity });
      }
    }
  }
  return { document, analysis: { kind: 'Analysis', schemaVersion: SCHEMA_VERSION, ...versions, documentHash: document.documentHash, sheets: document.sheets.map(s => ({ name: s.name, hidden: s.hidden })), tables, opportunities, incomplete } };
}
export function buildFillPlan(analysis, capabilities, providerVersion) {
  const calls = [], callIndex = new Map(), eligible = [], incomplete = [...analysis.incomplete];
  for (const item of analysis.opportunities) {
    const sources = capabilities.filter(c => c.fields.includes(item.field));
    if (sources.length !== 1) { incomplete.push({ ...item, reason: sources.length ? 'ambiguous-source' : 'provider-unavailable' }); continue; }
    const capability = sources[0];
    const key = idFor([item.anchor, capability.id]);
    let call = callIndex.get(key);
    if (!call) { call = { id: key, anchor: item.anchor, capability: capability.id, paid: capability.paid === true, ...(capability.maxCallsPerLookup>1?{maxCallsPerLookup:capability.maxCallsPerLookup}:{}), fields: [] }; calls.push(call);callIndex.set(key,call); }
    if (!call.fields.includes(item.field)) call.fields.push(item.field);
    eligible.push({ ...item, callId: key });
  }
  const body = { kind: 'FillPlan', schemaVersion: SCHEMA_VERSION, ...versions, providerVersion, documentHash: analysis.documentHash, policy: 'fill-blanks-only', estimatedCalls: calls.reduce((n,c)=>n+(c.maxCallsPerLookup??1),0), paidCalls: calls.filter(c => c.paid).reduce((n,c)=>n+(c.maxCallsPerLookup??1),0), calls, opportunities: eligible, incomplete };
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
  const previous=options.previousChangeSet;
  if(previous){assertChangeSet(previous);if(previous.planId!==plan.planId)fail('PLAN_INVALID','重试计划已变化');}
  const retryReasons=new Set(['provider-error','cancelled','not-started']);
  const retryIds=new Set(previous?.incomplete.filter(i=>retryReasons.has(i.reason)).map(i=>i.id));
  if(options.retryOnly&&!previous)fail('RETRY_INVALID','没有可重试的记录');
  const calls=options.retryOnly?plan.calls.filter(c=>plan.opportunities.some(o=>o.callId===c.id&&retryIds.has(o.id))):plan.calls;
  let completed=0;
  for (const call of calls) {
    if(options.signal?.aborted)break;
    const fields=options.retryOnly?call.fields.filter(f=>plan.opportunities.some(o=>o.callId===call.id&&o.field===f&&retryIds.has(o.id))):call.fields;
    let abort;
    try { results.set(call.id, await Promise.race([provider.lookup({...call,fields},{signal:options.signal}),new Promise((_,reject)=>{abort=()=>reject(Error('cancelled'));options.signal?.addEventListener('abort',abort,{once:true})})])); }
    catch { results.set(call.id, { status: options.signal?.aborted?'cancelled':'error', code: 'provider-error' }); }
    finally {if(abort)options.signal?.removeEventListener('abort',abort)}
    completed++;
    await options.onProgress?.({completed,total:calls.length,changeSet:assembleChangeSet(plan,provider,results,previous,options.retryOnly?retryIds:undefined,options.signal?.aborted)});
  }
  return assembleChangeSet(plan,provider,results,previous,options.retryOnly?retryIds:undefined,options.signal?.aborted);
}
function assembleChangeSet(plan,provider,results,previous,retryIds,cancelled){
  const changes = [], incomplete = [...plan.incomplete];
  for (const item of plan.opportunities) {
    if(retryIds&&!retryIds.has(item.id)){
      const change=previous.changes.find(c=>c.id===item.id),issue=previous.incomplete.find(c=>c.id===item.id);
      if(change)changes.push(change);else if(issue)incomplete.push(issue);continue;
    }
    if(!results.has(item.callId)){incomplete.push({...item,reason:cancelled?'cancelled':'not-started'});continue;}
    const result = results.get(item.callId), candidate = result?.values?.[item.field];
    let reason;
    if (result?.status !== 'exact') reason = result?.status === 'cancelled'?'cancelled':result?.status === 'ambiguous' ? 'candidate-review-required' : result?.status === 'not-found' ? 'no-match' : 'provider-error';
    else if (!candidate || candidate.value === null || candidate.value === undefined || String(candidate.value).trim() === '') reason = 'no-data';
    else if (candidate.confidence < 0.95 || !Number.isFinite(candidate.confidence)) reason = 'low-confidence';
    else if (!candidate.source || typeof candidate.source !== 'string' || !candidate.acquiredAt || !Number.isFinite(Date.parse(candidate.acquiredAt))) reason = 'missing-provenance';
    else if (!['string', 'number', 'boolean'].includes(typeof candidate.value) || (typeof candidate.value === 'number' && !Number.isFinite(candidate.value))) reason = 'invalid-value';
    else if (/^[\s]*[=+@-]/.test(String(candidate.value)) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(candidate.value)) || String(candidate.value).length > 32767) reason = 'unsafe-value';
    if (!reason && item.allowedValues && !item.allowedValues.includes(String(candidate.value))) reason = 'validation-conflict';
    if (reason) {
      const candidates = reason === 'candidate-review-required' && Array.isArray(result?.candidates)
        ? result.candidates.filter(c => typeof c?.company_name === 'string' && c.company_name.length <= 256 && typeof c.credit_no === 'string' && c.credit_no.length <= 32).slice(0,20).map(c => ({ id: idFor([c.company_name,c.credit_no]), company_name: c.company_name, credit_no: c.credit_no })) : [];
      incomplete.push({ ...item, reason, ...(candidates.length ? { candidates } : {}) }); continue;
    }
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
