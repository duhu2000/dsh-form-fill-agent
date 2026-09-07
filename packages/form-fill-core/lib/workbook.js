import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { readZip, writeZip, LIMITS, fail } from './zip.js';

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false });
const array = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'object' ? value?.['#text'] ?? '' : value ?? '';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function xmlEscape(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function parseXml(bytes) {
  const source = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || source.includes('\u0000') || source.includes('\ufffd')) fail('UNSAFE_XML', 'XML 编码、DTD 或实体不受支持');
  let depth = 0;
  for (const [tag] of source.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g)) {
    if (tag.startsWith('<?') || tag.startsWith('<!') || tag.endsWith('/>')) continue;
    depth += tag.startsWith('</') ? -1 : 1;
    if (depth > 128) fail('XML_DEPTH', 'XML 嵌套层级超限');
  }
  const valid = XMLValidator.validate(source);
  if (valid !== true) fail('BAD_XML', 'XML 结构不完整');
  try { return parser.parse(source); } catch { fail('BAD_XML', 'XML 解析失败'); }
}
export function coordinate(ref) {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(ref ?? '');
  if (!match) fail('CELL_REFERENCE', '单元格地址不合法');
  let column = 0; for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (row > LIMITS.rows || column > LIMITS.columns) fail('SHEET_LIMIT', '工作表行列超限');
  return { row, column };
}
export function address(row, column) {
  let letters = ''; for (let n = column; n; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return letters + row;
}
function range(ref) {
  const [a, b = a, ...rest] = String(ref).split(':'); if (rest.length) fail('CELL_REFERENCE', '区域不合法');
  const start=coordinate(a),end=coordinate(b);if(start.row>end.row||start.column>end.column)fail('CELL_REFERENCE','区域起止位置无效');return {start,end};
}
export function inRange(row, column, r) { return row >= r.start.row && row <= r.end.row && column >= r.start.column && column <= r.end.column; }
const allowedEntry = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|styles\.xml|sharedStrings\.xml|theme\/theme[0-9]+\.xml|worksheets\/sheet[0-9]+\.xml|worksheets\/_rels\/sheet[0-9]+\.xml\.rels|tables\/table[0-9]+\.xml))$/;
const unsupportedSheet = ['sheetProtection', 'drawing', 'legacyDrawing', 'oleObjects', 'controls', 'extLst', 'hyperlinks', 'AlternateContent'];
const safeFunctions=new Set('SUM AVERAGE MIN MAX COUNT COUNTA COUNTIF COUNTIFS SUMIF SUMIFS IF IFERROR AND OR NOT ROUND ROUNDUP ROUNDDOWN ABS LEN LEFT RIGHT MID TRIM CONCAT CONCATENATE TEXT VALUE DATE YEAR MONTH DAY TRUE FALSE'.split(' '));
function validateFormula(value){
 const formula=String(text(value));
 if(!formula||formula.length>8192||/[\[\]|]/.test(formula)||/https?:|file:|\\/i.test(formula)||typeof value==='object'&&Object.keys(value).some(k=>k!=='#text'))fail('UNSUPPORTED_FORMULA','仅支持普通内部公式，不支持外部、共享、数组或扩展公式');
 for(const m of formula.replace(/"(?:[^"]|"")*"/g,'').matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g))if(!safeFunctions.has(m[1].toUpperCase()))fail('UNSUPPORTED_FORMULA','公式函数尚未在保真白名单中：'+m[1]);
 return formula;
}
function reference(value,currentSheet){
 const match=/^(?:(?:'((?:[^']|'')+)'|([^'!]+))!)?(\$?[A-Z]{1,3}\$?[1-9][0-9]*)(?::(\$?[A-Z]{1,3}\$?[1-9][0-9]*))?$/.exec(String(value).replace(/^=/,''));
 if(!match)fail('UNSUPPORTED_STRUCTURE','仅支持工作簿内部固定矩形引用');
 const r=range((match[3]+':'+(match[4]||match[3])).replaceAll('$',''));
 if(r.start.row>r.end.row||r.start.column>r.end.column)fail('CELL_REFERENCE','引用范围无效');
 return {sheet:match[1]?.replaceAll("''","'")||match[2]||currentSheet,range:r};
}
// calcFeatures is calculation-engine version metadata, not worksheet formulas.
// Preserve only this known extension verbatim; all other extensions still fail.
function workbookWithoutCalcMetadata(source) {
  return source.replace(/<extLst>[\s\S]*?<\/extLst>/g, block => {
    const feature = '<xcalcf:feature\\s+name="[A-Za-z0-9_.:-]+"\\s*\\/>';
    const safe = new RegExp('^<extLst>\\s*<ext\\s+uri="\\{B58B0392-4F1F-4190-BB64-5DF3571DCE5F\\}"\\s+xmlns:xcalcf="http://schemas.microsoft.com/office/spreadsheetml/2018/calcfeatures"\\s*>\\s*<xcalcf:calcFeatures>\\s*(?:' + feature + '\\s*)+<\\/xcalcf:calcFeatures>\\s*<\\/ext>\\s*<\\/extLst>$');
    if (!safe.test(block)) fail('UNSUPPORTED_STRUCTURE', '工作簿扩展结构尚不支持');
    return '';
  });
}
export function parseWorkbook(input) {
  const bytes = Buffer.from(input), entries = readZip(bytes), parsed = new Map();
  for (const [name, data] of entries) {
    if (!allowedEntry.test(name)) fail('UNSUPPORTED_STRUCTURE', '暂不支持的工作簿部件：' + name);
    parsed.set(name, parseXml(data));
  }
  const workbook = parsed.get('xl/workbook.xml')?.workbook;
  const types = parsed.get('[Content_Types].xml')?.Types;
  const rootRels = parsed.get('_rels/.rels')?.Relationships;
  const workbookStructure = workbookWithoutCalcMetadata(entries.get('xl/workbook.xml')?.toString() || '');
  if (/<\w+:/.test(workbookStructure))fail('UNSUPPORTED_STRUCTURE','不支持带前缀的工作簿元素');
  if (!workbook || !types || !rootRels || workbook['@_xmlns'] !== 'http://schemas.openxmlformats.org/spreadsheetml/2006/main') fail('NOT_XLSX', '缺少标准 XLSX 工作簿结构');
  for (const entry of [...array(types.Override), ...array(types.Default)]) {
    if (/macro|vba|encrypted|binary/i.test(entry['@_ContentType'] ?? '')) fail('UNSUPPORTED_STRUCTURE', '宏或二进制工作簿不受支持');
  }
  if (workbook.workbookProtection!==undefined || workbook.externalReferences!==undefined || /<extLst\b/.test(workbookStructure)) fail('UNSUPPORTED_STRUCTURE', '保护、外部引用或未知工作簿扩展不受支持');
  const rels = array(parsed.get('xl/_rels/workbook.xml.rels')?.Relationships?.Relationship);
  for (const rel of [...rels, ...array(rootRels.Relationship),...[...parsed].filter(([p])=>p.endsWith('.rels')).flatMap(([,v])=>array(v.Relationships?.Relationship))]) {
    if (rel['@_TargetMode'] === 'External' || /^(?:[a-z]+:|\/\/)/i.test(rel['@_Target'] ?? '')) fail('EXTERNAL_LINK', '外部链接不受支持');
  }
  const strings = array(parsed.get('xl/sharedStrings.xml')?.sst?.si).map(si => si.r ? array(si.r).map(r => text(r.t)).join('') : text(si.t));
  const sheets = [], names = new Set(), paths = new Set();
  let totalCells = 0;
  for (const item of array(workbook.sheets?.sheet)) {
    const name = item['@_name'], id = item['@_r:id'];
    if (!name || names.has(name)) fail('BAD_WORKBOOK', '重复或缺失工作表名称');
    names.add(name);
    const candidates = rels.filter(r => r['@_Id'] === id && r['@_Type']?.endsWith('/worksheet'));
    if (candidates.length !== 1) fail('BAD_WORKBOOK', '工作表关系不唯一');
    const target = candidates[0]['@_Target'];
    const path = posix.normalize(target?.startsWith('/xl/') ? target.slice(1) : posix.join('xl', target ?? ''));
    if (!/^xl\/worksheets\/sheet[0-9]+\.xml$/.test(path) || paths.has(path)) fail('BAD_WORKBOOK', '工作表路径越界或重复');
    paths.add(path);
    const source = entries.get(path)?.toString('utf8'), sheet = parsed.get(path)?.worksheet;
    if (!sheet || /<(?:\w+:)(?:worksheet|row|c|f|sheetData|dataValidations|dataValidation|formula1|formula2|conditionalFormatting|cfRule|tableParts|tablePart|extLst|sheetProtection)\b/.test(source)) fail('UNSUPPORTED_STRUCTURE', '工作表 XML 命名空间格式不受支持');
    for (const key of unsupportedSheet) if (sheet[key] !== undefined) fail('UNSUPPORTED_STRUCTURE', '暂不支持工作表结构：' + key);
    for(const cf of array(sheet.conditionalFormatting)){
      String(cf['@_sqref']||'').split(/\s+/).forEach(range);
      if(!cf.cfRule)fail('UNSUPPORTED_STRUCTURE','条件格式缺少规则');
      for(const rule of array(cf.cfRule)){
        if(!['cellIs','expression','colorScale','dataBar','iconSet','duplicateValues'].includes(rule['@_type'])||rule.extLst!==undefined)fail('UNSUPPORTED_STRUCTURE','条件格式规则暂不支持');
        for(const formula of array(rule.formula))validateFormula(formula);
        for(const group of ['colorScale','dataBar','iconSet'])for(const threshold of array(rule[group]?.cfvo))if(threshold['@_type']==='formula')validateFormula(threshold['@_val']);
      }
    }
    if (sheet.dataValidations !== undefined && !sheet.dataValidations?.dataValidation) fail('UNSUPPORTED_STRUCTURE', '下拉验证结构为空');
    const validations = array(sheet.dataValidations?.dataValidation).map(rule => {
      const literal = text(rule.formula1);
      const refs = String(rule['@_sqref'] ?? '').trim().split(/\s+/);
      if (refs.length > 1000) fail('SHEET_LIMIT', '验证区域过多');
      const ranges = refs.map(range);
      if (ranges.some(r => r.start.row > r.end.row || r.start.column > r.end.column)) fail('CELL_REFERENCE', '验证区域无效');
      const children=Object.keys(rule).filter(k=>!k.startsWith('@_'));
      if (!rule['@_type'] && children.length===0) return null;
      if(rule['@_type']==='whole'&&rule['@_operator']==='between'&&children.every(k=>['formula1','formula2'].includes(k))&&/^-?\d+$/.test(literal)&&/^-?\d+$/.test(text(rule.formula2))&&Number.isSafeInteger(Number(literal))&&Number.isSafeInteger(Number(text(rule.formula2)))&&Number(literal)<=Number(text(rule.formula2)))return {ranges,values:[]};
      if (rule['@_type'] !== 'list' || typeof literal !== 'string' || !literal || rule.formula2 !== undefined || children.some(k=>k!=='formula1')) fail('UNSUPPORTED_STRUCTURE', '仅支持固定文本或内部区域下拉列表');
      return /^"[^"]*"$/.test(literal)?{ ranges, values: literal.slice(1,-1).split(',') }:{ranges,reference:literal};
    }).filter(Boolean);
    if (sheet.dimension?.['@_ref']) range(sheet.dimension['@_ref']);
    const merges = array(sheet.mergeCells?.mergeCell).map(m => range(m['@_ref']));
    const hiddenColumns = array(sheet.cols?.col).filter(c => c['@_hidden'] === '1').map(c => [Number(c['@_min']), Number(c['@_max'])]);
    const cells = {}, rows = [], rowIds = new Set();
    for (const row of array(sheet.sheetData?.row)) {
      const number = Number(row['@_r']);
      if (!Number.isInteger(number) || number < 1 || number > LIMITS.rows || rowIds.has(number)) fail('SHEET_LIMIT', '工作表行号重复或超限');
      rowIds.add(number);
      rows.push({ number, hidden: row['@_hidden'] === '1' });
      for (const cell of array(row.c)) {
        const ref = cell['@_r'], location = coordinate(ref);
        if (cell.f !== undefined) validateFormula(cell.f);
        if (location.row !== number || cells[ref]) fail('CELL_REFERENCE', '单元格地址与行冲突');
        if (++totalCells > LIMITS.cells) fail('SHEET_LIMIT', '单元格总数超限');
        const type = cell['@_t'] ?? 'n';
        if (!['n', 's', 'inlineStr', 'str', 'b', 'e', 'd'].includes(type)) fail('CELL_TYPE', '不支持的单元格类型');
        let value = text(cell.v);
        if (type === 's') { if (!/^[0-9]+$/.test(value) || strings[Number(value)] === undefined) fail('BAD_WORKBOOK', '共享字符串索引无效'); value = strings[Number(value)]; }
        if (type === 'inlineStr') value = cell.is?.r ? array(cell.is.r).map(r => text(r.t)).join('') : text(cell.is?.t);
        if (String(value).length > 32767) fail('CELL_LIMIT', '单元格文本过长');
        cells[ref] = { ref, ...location, type, value: String(value), formula: cell.f !== undefined, style: cell['@_s'], hidden: row['@_hidden'] === '1' || hiddenColumns.some(([a, b]) => location.column >= a && location.column <= b) };
      }
    }
    sheets.push({ name, path, ...(sheet.dimension?.['@_ref']?{extent:range(sheet.dimension['@_ref']).end}:{}), hidden: item['@_state'] !== undefined && item['@_state'] !== 'visible', cells, rows: rows.sort((a, b) => a.number - b.number), merges, hiddenColumns, ...(validations.length ? { validations } : {}) });
  }
  if (!sheets.length || sheets.length > LIMITS.sheets) fail('SHEET_LIMIT', '工作表数量必须为 1–16');
  const tablePaths=new Set();
  const definitions=array(workbook.definedNames?.definedName);
  const definitionIds=new Set();for(const d of definitions){const id=JSON.stringify([d['@_name'],d['@_localSheetId']]);if(!d['@_name']||definitionIds.has(id))fail('BAD_WORKBOOK','命名区域重复或缺失名称');definitionIds.add(id);}
  for(const d of definitions)reference(text(d),sheets[Number(d['@_localSheetId'])]?.name);
  for(const [index,sheet] of sheets.entries()){
    for(const rule of sheet.validations||[])if(rule.reference){
      const expression=rule.reference.replace(/^=/,''),matches=definitions.filter(d=>d['@_name']===expression&&(d['@_localSheetId']===undefined||Number(d['@_localSheetId'])===index));
      const local=matches.find(d=>Number(d['@_localSheetId'])===index),definition=local||matches[0];
      const ref=reference(definition?text(definition):expression,sheet.name),source=sheets.find(s=>s.name===ref.sheet);
      if(!source)fail('UNSUPPORTED_STRUCTURE','下拉引用工作表不存在');
      const area=(ref.range.end.row-ref.range.start.row+1)*(ref.range.end.column-ref.range.start.column+1);if(area>10000)fail('SHEET_LIMIT','下拉来源区域过大');
      const values=Object.values(source.cells).filter(c=>inRange(c.row,c.column,ref.range));if(values.some(c=>c.formula||c.type==='e'))fail('UNSUPPORTED_STRUCTURE','下拉来源必须为静态值');
      rule.values=[...new Set(values.map(c=>c.value).filter(v=>v.trim()))];delete rule.reference;
      (source.readOnlyRanges??=[]).push(ref.range);
    }
    const parts=array(parsed.get(sheet.path).worksheet.tableParts?.tablePart),relations=array(parsed.get('xl/worksheets/_rels/'+posix.basename(sheet.path)+'.rels')?.Relationships?.Relationship);
    for(const rel of relations)if(!rel['@_Type']?.endsWith('/table'))fail('UNSUPPORTED_STRUCTURE','仅支持内部表格关系');
    for(const part of parts){
      const matches=relations.filter(r=>r['@_Id']===part['@_r:id']);if(matches.length!==1)fail('BAD_WORKBOOK','表格对象关系不唯一');
      const path=posix.normalize(posix.join('xl/worksheets',matches[0]['@_Target']||'')),table=parsed.get(path)?.table;
      if(!/^xl\/tables\/table[0-9]+\.xml$/.test(path)||!table||table['@_tableType']&&table['@_tableType']!=='worksheet'||table.extLst!==undefined)fail('UNSUPPORTED_STRUCTURE','不支持外部或扩展表格对象');
      if(/<\w+:/.test(entries.get(path)?.toString()||''))fail('UNSUPPORTED_STRUCTURE','不支持带前缀的表格元素');
      if(tablePaths.has(path))fail('BAD_WORKBOOK','表格对象被重复引用');tablePaths.add(path);
      const r=range(table['@_ref']),columns=array(table.tableColumns?.tableColumn);
      if(columns.length!==r.end.column-r.start.column+1||columns.some(c=>c.calculatedColumnFormula!==undefined||c.totalsRowFormula!==undefined||c.xmlColumnPr))fail('UNSUPPORTED_STRUCTURE','表格计算列或列定义不支持');
      if(table['@_headerRowCount']!=='0')(sheet.readOnlyRanges??=[]).push({start:r.start,end:{row:r.start.row,column:r.end.column}});
      if(Number(table['@_totalsRowCount']||0)>0)(sheet.readOnlyRanges??=[]).push({start:{row:r.end.row,column:r.start.column},end:r.end});
    }
  }
  for(const path of entries.keys())if(path.startsWith('xl/tables/')&&!tablePaths.has(path))fail('BAD_WORKBOOK','孤立表格对象不受支持');
  return { schemaVersion: 1, kind: 'DocumentSchema', documentHash: digest(bytes), sheets, entries };
}

export function isBlank(cell) { return !cell || (!cell.formula && cell.type !== 'e' && cell.value.trim() === ''); }
export function validationAllows(sheet, row, column, value) {
  return (sheet.validations ?? []).filter(rule => rule.ranges.some(r => inRange(row, column, r))).every(rule => rule.values.includes(String(value)));
}
export function writeWorkbook(document, changes) {
  const entries = new Map(document.entries);
  const seen = new Set();
  for (const change of changes) {
    const sheet = document.sheets.find(s => s.name === change.sheet);
    if (!sheet) fail('CHANGE_TARGET', '工作表不存在');
    const { row, column } = coordinate(change.cell), cell = sheet.cells[change.cell];
    const key = sheet.name + ':' + change.cell;
    if (seen.has(key)) fail('CHANGE_DUPLICATE', '重复填写位置'); seen.add(key);
    if (sheet.hidden || cell?.hidden || sheet.rows.find(r => r.number === row)?.hidden || sheet.hiddenColumns.some(([a, b]) => column >= a && column <= b) || sheet.merges.some(r => inRange(row, column, r))) fail('CHANGE_TARGET', '隐藏或合并单元格不可填写');
    if ((sheet.readOnlyRanges||[]).some(r=>inRange(row,column,r)))fail('CHANGE_TARGET','下拉来源或表格标题/汇总区域不可填写');
    if (!isBlank(cell) || (cell?.value ?? '') !== change.oldValue) fail('WRITE_CONFLICT', '单元格已有值或预览后已更改');
    if (!validationAllows(sheet, row, column, change.newValue)) fail('VALIDATION_CONFLICT', '填写值不在原表下拉选项内');
    let source = entries.get(sheet.path).toString();
    const safe = xmlEscape(change.newValue);
    const replacement = '<c r="' + change.cell + '"' + (cell?.style !== undefined ? ' s="' + xmlEscape(cell.style) + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + safe + '</t></is></c>';
    const rowRegex = new RegExp('<row\\b[^>]*\\br="' + row + '"[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)');
    const rowMatch = source.match(rowRegex);
    if (!rowMatch) fail('CHANGE_TARGET', '仅允许填写已有记录行');
    let xml = rowMatch[0];
    const cellRegex = new RegExp('<c\\b[^>]*\\br="' + change.cell + '"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
    if (cellRegex.test(xml)) xml = xml.replace(cellRegex, () => replacement);
    else {
      let inserted = false;
      xml = xml.replace(/<c\b[^>]*\br="([A-Z]+[0-9]+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g, (whole, ref) => {
        if (!inserted && coordinate(ref).column > column) { inserted = true; return replacement + whole; } return whole;
      });
      if (!inserted) xml = xml.replace('</row>', replacement + '</row>');
    }
    source = source.replace(rowMatch[0], () => xml);
    entries.set(sheet.path, Buffer.from(source));
  }
  if(changes.length&&document.sheets.some(s=>Object.values(s.cells).some(c=>c.formula))){
    for(const sheet of document.sheets)entries.set(sheet.path,Buffer.from(entries.get(sheet.path).toString().replace(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,c=>/<f\b/.test(c)?c.replace(/<v\b[^>]*(?:\/>|>[\s\S]*?<\/v>)/g,''):c)));
    let xml=entries.get('xl/workbook.xml').toString().replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/g,'');
    entries.set('xl/workbook.xml',Buffer.from(xml.replace('</workbook>','<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>')));
  }
  const output = writeZip(entries);
  if (output.length > LIMITS.bytes) fail('OUTPUT_TOO_LARGE', '输出副本超过 8 MiB');
  return output;
}
