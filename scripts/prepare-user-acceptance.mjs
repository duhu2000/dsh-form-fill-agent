// Reproducible synthetic input/expected-output bundle for human desktop acceptance.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {previewBytes} from 'dsh-form-fill-agent';
import {applyChangeSet} from 'form-fill-core';
import {readZip,writeZip} from '../packages/form-fill-core/lib/zip.js';
import {fixtureBytes} from './generate-fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(process.argv[2]||join(root,'artifacts/uat-alpha11'));
await mkdir(dirname(directory),{recursive:true});
await mkdir(directory); // Never overwrite a reviewer-edited acceptance bundle.
const cases=[];
for(const name of ['客户台账','供应商准入表','合同主体信息表'])cases.push([name,await readFile(join(root,'fixtures/xlsx',name+'.xlsx'))]);
const entries=readZip(fixtureBytes('保真验收',['企业名称','法定代表人'],[['合成客户甲有限公司','']],{title:false}));
const path='xl/worksheets/sheet1.xml';
let sheet=entries.get(path).toString().replace('<worksheet xmlns=', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns=');
sheet=sheet.replace('ref="A1:B2"','ref="A1:D4"').replace('</sheetData>','<row r="3"><c r="B3"><f>LEN(B2)</f><v>999</v></c><c r="D3" t="inlineStr"><is><t>合成人员甲</t></is></c></row><row r="4"><c r="D4" t="inlineStr"><is><t>合成人员乙</t></is></c></row></sheetData>');
sheet=sheet.replace('<autoFilter ref="A1:B2"/>','').replace('</worksheet>','<conditionalFormatting sqref="B2"><cfRule type="expression" dxfId="0" priority="1"><formula>LEN(B2)&gt;0</formula></cfRule></conditionalFormatting><dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2"><formula1>AllowedPeople</formula1></dataValidation></dataValidations><tableParts count="1"><tablePart r:id="table1"/></tableParts></worksheet>');
entries.set(path,Buffer.from(sheet));
entries.set('xl/styles.xml',Buffer.from(entries.get('xl/styles.xml').toString().replace('</styleSheet>','<dxfs count="1"><dxf><font><color rgb="FF008000"/></font></dxf></dxfs></styleSheet>')));
entries.set('xl/workbook.xml',Buffer.from(entries.get('xl/workbook.xml').toString().replace('</workbook>',"<definedNames><definedName name=\"AllowedPeople\">'保真验收'!$D$3:$D$4</definedName></definedNames></workbook>")));
entries.set('xl/worksheets/_rels/sheet1.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="table1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>'));
entries.set('xl/tables/table1.xml',Buffer.from('<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="SyntheticTable" displayName="SyntheticTable" ref="A1:B2" totalsRowShown="0"><autoFilter ref="A1:B2"/><tableColumns count="2"><tableColumn id="1" name="企业名称"/><tableColumn id="2" name="法定代表人"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>'));
entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString().replace('</Types>','<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>')));
cases.push(['Excel保真组合',writeZip(entries)]);
const receipt=[];
for(const [name,bytes]of cases){
 const preview=await previewBytes(bytes),out=applyChangeSet(bytes,preview.plan,preview.changeSet,{confirmChangeSetId:preview.changeSet.changeSetId});
 const before=readZip(bytes),after=readZip(out.bytes);
 if(name==='Excel保真组合'){
  assert.equal(out.changes.length,1);const s=XLSX.read(out.bytes,{sheetStubs:true}).Sheets['保真验收'];assert.equal(s.B2.v,'合成人员甲');assert.equal(s.B3.f,'LEN(B2)');
  for(const part of ['xl/styles.xml','xl/tables/table1.xml','xl/worksheets/_rels/sheet1.xml.rels'])assert.deepEqual(after.get(part),before.get(part));
  for(const marker of ['<conditionalFormatting','<dataValidations','<tableParts'])assert.ok(after.get(path).toString().includes(marker));
 }
 await writeFile(join(directory,name+'-原表.xlsx'),bytes);await writeFile(join(directory,name+'-预期副本.xlsx'),out.bytes);
 receipt.push({template:name,filled:out.changes.length,incomplete:out.incomplete.length,synthetic:true});
}
await writeFile(join(directory,'验收说明.md'),'# AI填表 alpha.11 合成验收包\n\n仅合成数据，预期副本由 mock Provider 生成，不是真实企查查查询结果。\n\n三套业务模板用于导入、字段设置、选择与下载核对。Excel保真组合：原表 B2 为空；预期副本 B2=合成人员甲；B3 保留 LEN(B2)，在 Excel 中应重算为 5；B2 下拉应含合成人员甲/乙，填写后文字应为绿色；A1:B2 保留蓝色表格样式和筛选。D3:D4 是下拉来源，不应修改。\n\n请用 Microsoft Excel 打开预期副本，记录是否出现修复警告、上述结果及 Excel 版本；未执行前不能签收。新副本与原表分开，不覆盖原文件。\n');
console.log(JSON.stringify({directory,cases:receipt,desktopSignoff:false}));
