import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {previewBytes} from 'dsh-form-fill-agent';
import {parseWorkbook,applyChangeSet} from 'form-fill-core';
import {readZip,writeZip} from '../packages/form-fill-core/lib/zip.js';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
const path='xl/worksheets/sheet1.xml';
test('unsafe conditional thresholds, namespaced formulas and reversed dimensions fail closed',()=>{
 for(const fragment of ['<conditionalFormatting sqref="B2"><cfRule type="colorScale"><colorScale><cfvo type="formula" val="WEBSERVICE(&quot;https://invalid.test&quot;)"/></colorScale></cfRule></conditionalFormatting>','<x:conditionalFormatting xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'])assert.throws(()=>parseWorkbook(writeZip(add(input(),fragment))));
 const entries=input();entries.set(path,Buffer.from(entries.get(path).toString().replace(/<dimension[^>]*\/>/,'<dimension ref="B2:A1"/>')));assert.throws(()=>parseWorkbook(writeZip(entries)),{code:'CELL_REFERENCE'});
});
function input(){return readZip(fixtureBytes('保真表',['企业名称','法定代表人'],[['合成客户甲有限公司','']],{title:false}))}
function add(entries,xml){entries.set(path,Buffer.from(entries.get(path).toString().replace('</worksheet>',xml+'</worksheet>')));return entries}
test('ordinary formula coexists, formula XML retained, stale caches removed and full recalculation requested',async()=>{
 const entries=input();entries.set(path,Buffer.from(entries.get(path).toString().replace('</sheetData>','<row r="3"><c r="A3"/><c r="B3"><f>LEN(B2)</f><v>999</v></c></row></sheetData>')));
 const bytes=writeZip(entries),p=await previewBytes(bytes),output=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}).bytes,out=readZip(output);
 assert.ok(out.get(path).toString().includes('<f>LEN(B2)</f>'));assert.ok(!out.get(path).toString().includes('<v>999</v>'));
 assert.ok(out.get('xl/workbook.xml').toString().includes('fullCalcOnLoad="1"'));
 const sheet=XLSX.read(output,{sheetStubs:true}).Sheets['保真表'];assert.equal(sheet.B3.f,'LEN(B2)');assert.equal(sheet.B2.v,'合成人员甲');
 for(const [name,bytes]of entries)if(![path,'xl/workbook.xml'].includes(name))assert.deepEqual(out.get(name),bytes);
});
for(const named of [false,true])test('static '+(named?'named':'direct')+' dropdown range and conditional style remain intact',async()=>{
 const entries=input();entries.set(path,Buffer.from(entries.get(path).toString().replace('</sheetData>','<row r="3"><c r="D3" t="inlineStr"><is><t>合成人员甲</t></is></c></row><row r="4"><c r="D4" t="inlineStr"><is><t>合成人员乙</t></is></c></row></sheetData>')));
 const ref=named?'AllowedPeople':"'保真表'!$D$3:$D$4";
 if(named)entries.set('xl/workbook.xml',Buffer.from(entries.get('xl/workbook.xml').toString().replace('</workbook>',"<definedNames><definedName name=\"AllowedPeople\">'保真表'!$D$3:$D$4</definedName></definedNames></workbook>")));
 const rules='<dataValidations count="1"><dataValidation type="list" sqref="B2"><formula1>'+ref+'</formula1></dataValidation></dataValidations><conditionalFormatting sqref="B2"><cfRule type="expression" priority="1"><formula>LEN(B2)&gt;0</formula></cfRule></conditionalFormatting>';
 add(entries,rules);const bytes=writeZip(entries),p=await previewBytes(bytes);assert.equal(p.changeSet.changes.length,1);
 const out=readZip(applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}).bytes);assert.ok(out.get(path).toString().includes(rules));
 for(const [name,bytes]of entries)if(name!==path)assert.deepEqual(out.get(name),bytes);
});
test('ordinary table object preserves table, relationships, column definitions and styles',async()=>{
 const entries=add(input(),'<tableParts count="1"><tablePart r:id="rId1"/></tableParts>');
 entries.set('xl/worksheets/_rels/sheet1.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>'));
 entries.set('xl/tables/table1.xml',Buffer.from('<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Synthetic" displayName="Synthetic" ref="A1:B2"><autoFilter ref="A1:B2"/><tableColumns count="2"><tableColumn id="1" name="企业名称"/><tableColumn id="2" name="法定代表人"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/></table>'));
 entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString().replace('</Types>','<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>')));
 const bytes=writeZip(entries),p=await previewBytes(bytes);assert.equal(p.changeSet.changes.length,1);const output=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}).bytes,out=readZip(output);
 for(const [name,value]of entries)if(name!==path)assert.deepEqual(out.get(name),value);assert.equal(parseWorkbook(output).sheets[0].cells.B2.value,'合成人员甲');
 entries.set('xl/tables/table1.xml',Buffer.from(entries.get('xl/tables/table1.xml').toString().replace('<autoFilter','<extLst/><autoFilter')));assert.throws(()=>parseWorkbook(writeZip(entries)),{code:'UNSUPPORTED_STRUCTURE'});
});
