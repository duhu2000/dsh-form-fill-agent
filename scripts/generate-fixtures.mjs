import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../packages/form-fill-core/lib/zip.js';
const root = fileURLToPath(new URL('../fixtures/xlsx/', import.meta.url));
const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function columnLabel(number){let out='';for(let n=number;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out}
function cell(row, col, value, style) {
  const ref = columnLabel(col+1) + row;
  return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + escape(value) + '</t></is></c>';
}
export function fixtureBytes(name, headers, records, { title = true, hiddenSheet = false } = {}) {
  const headerRow = title ? 3 : 1;
  const maxCol = columnLabel(headers.length), lastRow = headerRow + records.length;
  const rows = (title ? '<row r="1" ht="28" customHeight="1">' + cell(1, 0, name + ' · 仅合成演示，无真实客户数据', 1) + '</row>' : '') +
    '<row r="' + headerRow + '" ht="25" customHeight="1">' + headers.map((v, c) => cell(headerRow, c, v, 1)).join('') + '</row>' +
    records.map((record, i) => '<row r="' + (headerRow + 1 + i) + '" ht="24" customHeight="1">' + headers.map((_, c) => cell(headerRow + 1 + i, c, record[c] ?? '', 0)).join('') + '</row>').join('');
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + maxCol + lastRow + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="' + headers.length + '" width="27" customWidth="1"/></cols><sheetData>' + rows + '</sheetData><autoFilter ref="A' + headerRow + ':' + maxCol + lastRow + '"/>' + (title ? '<mergeCells count="1"><mergeCell ref="A1:' + maxCol + '1"/></mergeCells>' : '') + '</worksheet>';
  const entries = new Map(Object.entries({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' + (hiddenSheet ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : '') + '</Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/>' + (hiddenSheet ? '<sheet name="隐藏说明" sheetId="2" state="hidden" r:id="rId2"/>' : '') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' + (hiddenSheet ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : '') + '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF224D65"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet,
    ...(hiddenSheet ? { 'xl/worksheets/sheet2.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">' + cell(1, 0, '隐藏区域必须原样保留', 0) + '</row></sheetData></worksheet>' } : {}),
  }).map(([k, v]) => [k, Buffer.from(v)]));
  return writeZip(entries);
}
export const templates = [
  ['客户台账', ['客户名称', '信用代码', '法人代表', '成立时间', '注册地址', '客户经理'], [
    ['合成客户甲有限公司', '', '', '', '', '人工经理甲'],
    ['合成客户乙有限公司', '', '原有人名必须保留', '', '已有地址必须保留', ''],
    ['合成未知客户有限公司', '', '', '', '', ''],
  ]],
  ['供应商准入表', ['供应商名称', '统一社会信用代码', '法定代表人', '经营状态', '登记机关', '风险结论', '审批意见'], [
    ['合成供应商甲有限公司', '', '', '', '', '', '待填写'],
    ['合成多候选有限公司', '', '', '', '', '', ''],
  ]],
  ['合同主体信息表', ['合同角色', '主体名称', '统一社会信用代码', '法定代表人', '住所', '付款条款'], [
    ['甲方', '合成合同甲方有限公司', '', '', '', '人工约定，不自动生成'],
    ['乙方', '合成合同乙方有限公司', '', '', '', ''],
  ]],
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(root, { recursive: true });
  const packaged = fileURLToPath(new URL('../packages/dsh-form-fill-agent/lib/fixtures/', import.meta.url));
  await mkdir(packaged, { recursive: true });
  for (const [name, headers, rows] of templates) {
    const bytes = fixtureBytes(name, headers, rows, { hiddenSheet: name === '供应商准入表' });
    await writeFile(root + name + '.xlsx', bytes);
    await writeFile(packaged + name + '.xlsx', bytes);
  }
  console.log('Generated 3 deterministic synthetic XLSX fixtures');
}
