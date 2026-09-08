import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument, buildFillPlan, applyChangeSet, parseWorkbook } from 'form-fill-core';
import { previewBytes } from 'dsh-form-fill-agent';
import { FIELD_CATALOG, createMockProvider } from 'qcc-form-fill-provider';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
import { readZip, writeZip } from '../packages/form-fill-core/lib/zip.js';

const sheet='合成重复位置';
const mapping=(column,field,role)=>({sheet,column,field,...(role?{role}:{})});
test('confirmed duplicate outputs fill independently, deduplicate queries and preserve OOXML',async()=>{
 let bytes=fixtureBytes(sheet,['企业名称','法定代表人','法人','保留文本','零值','布尔','公式'],[['合成客户甲有限公司','','','原值',0,false,'']],{title:false});
 const zip=readZip(bytes);zip.set('xl/worksheets/sheet1.xml',Buffer.from(zip.get('xl/worksheets/sheet1.xml').toString().replace(/<c r="G2"[^>]*>.*?<\/c>/,'<c r="G2" s="0" t="str"><f>IF(1=1,"","x")</f><v></v></c>').replace(/<c r="E2"[^>]*>.*?<\/c>/,'<c r="E2" s="0" t="n"><v>0</v></c>').replace(/<c r="F2"[^>]*>.*?<\/c>/,'<c r="F2" s="0" t="b"><v>0</v></c>')));bytes=writeZip(zip);
 assert.equal(analyzeDocument(bytes,FIELD_CATALOG).analysis.opportunities.length,0);
 const configuration={mappings:[2,3,4,5,6,7].map(c=>mapping(c,'legal_person'))};
 const provider=createMockProvider(),p=await previewBytes(bytes,{configuration,provider});
 assert.deepEqual(p.changeSet.changes.map(c=>c.cell),['B2','C2']);
 assert.equal(provider.calls,1);
 assert.equal(p.plan.calls.length,1);
 const out=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId});
 const before=parseWorkbook(bytes),after=parseWorkbook(out.bytes);
 for(const ref of ['D2','E2','F2','G2'])assert.deepEqual(after.sheets[0].cells[ref],before.sheets[0].cells[ref]);
 for(const [path,data] of before.entries)if(!['xl/worksheets/sheet1.xml','xl/workbook.xml'].includes(path))assert.deepEqual(after.entries.get(path),data);
 assert.match(after.entries.get('xl/workbook.xml').toString(),/fullCalcOnLoad="1"/);
 assert.equal(after.sheets[0].cells.B2.value,after.sheets[0].cells.C2.value);
 const again=createMockProvider();await previewBytes(bytes,{configuration,provider:again});assert.equal(again.calls,1,'new task must query independently');
});
test('explicit output identity does not replace the unique input identity',async()=>{
 const bytes=fixtureBytes(sheet,['企业名称','企业名称','法定代表人'],[['合成客户甲有限公司','','']],{title:false});
 const conflict={mappings:[mapping(1,'company_name'),mapping(2,'company_name')]};
 assert.equal(analyzeDocument(bytes,FIELD_CATALOG,conflict).analysis.tables.length,0);
 const configuration={mappings:[mapping(1,'company_name','input'),mapping(2,'company_name','output')]};
 const p=await previewBytes(bytes,{configuration,selectedFields:['company_name','legal_person']});
 assert.deepEqual(p.analysis.tables[0].anchorColumns,[1]);
 assert.deepEqual(p.analysis.opportunities.map(c=>c.cell),['B2','C2']);
 assert.deepEqual(p.analysis.opportunities[0].anchor,{company_name:'合成客户甲有限公司'});
 const allOutput={mappings:[mapping(1,'company_name','output'),mapping(2,'company_name','output')]};
 assert.equal(analyzeDocument(bytes,FIELD_CATALOG,allOutput).analysis.opportunities.length,0);
});
test('different subject parameters never share a planned lookup, unknown and address remain unconfirmed',()=>{
 const bytes=fixtureBytes(sheet,['企业名称','法定代表人'],[['合成甲有限公司',''],['合成乙有限公司','']],{title:false});
 const a=analyzeDocument(bytes,FIELD_CATALOG).analysis;
 assert.equal(buildFillPlan(a,createMockProvider().capabilities,'test').calls.length,2);
 const ambiguous=fixtureBytes(sheet,['企业名称','地址','未知口径'],[['合成甲有限公司','','']],{title:false});
 assert.equal(analyzeDocument(ambiguous,FIELD_CATALOG).analysis.opportunities.length,0);
});
test('same names with distinct identifiers block until an explicit identifier input is chosen',()=>{
 const bytes=fixtureBytes(sheet,['企业名称','信用代码','法定代表人'],[['合成同名有限公司','913200000000000001',''],['合成同名有限公司','913200000000000002','']],{title:false});
 assert.equal(analyzeDocument(bytes,FIELD_CATALOG).analysis.opportunities.length,0);
 const a=analyzeDocument(bytes,FIELD_CATALOG,{headers:[{sheet,row:1}],mappings:[mapping(1,'company_name','output'),mapping(2,'credit_no','input')]}).analysis;
 assert.equal(buildFillPlan(a,createMockProvider().capabilities,'test').calls.length,2);
 assert.notDeepEqual(a.opportunities[0].anchor,a.opportunities[1].anchor);
});
