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
  return { start: coordinate(a), end: coordinate(b) };
}
export function inRange(row, column, r) { return row >= r.start.row && row <= r.end.row && column >= r.start.column && column <= r.end.column; }
const allowedEntry = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core)\.xml|xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|styles\.xml|sharedStrings\.xml|theme\/theme[0-9]+\.xml|worksheets\/sheet[0-9]+\.xml))$/;
const unsupportedSheet = ['sheetProtection', 'dataValidations', 'conditionalFormatting', 'drawing', 'legacyDrawing', 'tableParts', 'oleObjects', 'controls', 'extLst', 'hyperlinks', 'AlternateContent'];
export function parseWorkbook(input) {
  const bytes = Buffer.from(input), entries = readZip(bytes), parsed = new Map();
  for (const [name, data] of entries) {
    if (!allowedEntry.test(name)) fail('UNSUPPORTED_STRUCTURE', '暂不支持的工作簿部件：' + name);
    parsed.set(name, parseXml(data));
  }
  const workbook = parsed.get('xl/workbook.xml')?.workbook;
  const types = parsed.get('[Content_Types].xml')?.Types;
  const rootRels = parsed.get('_rels/.rels')?.Relationships;
  if (!workbook || !types || !rootRels || workbook['@_xmlns'] !== 'http://schemas.openxmlformats.org/spreadsheetml/2006/main') fail('NOT_XLSX', '缺少标准 XLSX 工作簿结构');
  for (const entry of [...array(types.Override), ...array(types.Default)]) {
    if (/macro|vba|encrypted|binary/i.test(entry['@_ContentType'] ?? '')) fail('UNSUPPORTED_STRUCTURE', '宏或二进制工作簿不受支持');
  }
  if (workbook.definedNames || workbook.workbookProtection || workbook.externalReferences || workbook.extLst) fail('UNSUPPORTED_STRUCTURE', '命名区域、保护或外部引用不受支持');
  const rels = array(parsed.get('xl/_rels/workbook.xml.rels')?.Relationships?.Relationship);
  for (const rel of [...rels, ...array(rootRels.Relationship)]) {
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
    if (!sheet || /<(?:\w+:)(?:worksheet|row|c|sheetData)\b/.test(source)) fail('UNSUPPORTED_STRUCTURE', '工作表 XML 命名空间格式不受支持');
    for (const key of unsupportedSheet) if (sheet[key] !== undefined) fail('UNSUPPORTED_STRUCTURE', '暂不支持工作表结构：' + key);
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
        if (cell.f !== undefined) fail('UNSUPPORTED_FORMULA', 'M1 尚不支持含公式的工作簿；请提供仅含值的副本，避免公式缓存失真');
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
    sheets.push({ name, path, hidden: item['@_state'] !== undefined && item['@_state'] !== 'visible', cells, rows: rows.sort((a, b) => a.number - b.number), merges, hiddenColumns });
  }
  if (!sheets.length || sheets.length > LIMITS.sheets) fail('SHEET_LIMIT', '工作表数量必须为 1–16');
  return { schemaVersion: 1, kind: 'DocumentSchema', documentHash: digest(bytes), sheets, entries };
}

export function isBlank(cell) { return !cell || (!cell.formula && cell.type !== 'e' && cell.value.trim() === ''); }
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
    if (!isBlank(cell) || (cell?.value ?? '') !== change.oldValue) fail('WRITE_CONFLICT', '单元格已有值或预览后已更改');
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
  const output = writeZip(entries);
  if (output.length > LIMITS.bytes) fail('OUTPUT_TOO_LARGE', '输出副本超过 8 MiB');
  return output;
}
