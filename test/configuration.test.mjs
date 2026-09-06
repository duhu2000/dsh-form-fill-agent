import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx';
import { analyzeDocument, applyChangeSet, parseWorkbook } from 'form-fill-core';
import { readZip, writeZip } from '../packages/form-fill-core/lib/zip.js';
import { FIELD_CATALOG, createMockProvider, createQccProvider } from 'qcc-form-fill-provider';
import { previewBytes } from 'dsh-form-fill-agent';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
import { createFormFillHandler } from '../packages/dsh-form-fill-agent/lib/http.js';

const file=(name='合成客户甲有限公司',headers=['企业名称','法定代表人'])=>fixtureBytes('配置表',headers,[[name,'']],{title:false});
test('field scope limits actual provider work, persists, rejects stale revisions and preserves anchors',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'form-fill-scope-'));let h=handler({taskDirectory:directory});
 try{
  const bytes=fixtureBytes('范围表',['企业名称','法定代表人','注册地址'],[['合成客户甲有限公司','','']],{title:false});
  const task=(await h.request('/preview',{base64:bytes.toString('base64'),analyzeOnly:true})).json;
  for(const selectedFields of [['invented'],['company_name'],['legal_person','legal_person']])assert.equal((await h.request('/scope',{id:task.id,expectedRevision:task.revision,selectedFields})).status,400);
  const scoped=await h.request('/scope',{id:task.id,expectedRevision:task.revision,selectedFields:['legal_person']});
  assert.equal(scoped.status,200);assert.deepEqual(scoped.json.selectedFields,['legal_person']);
  assert.equal((await h.request('/scope',{id:task.id,expectedRevision:task.revision,selectedFields:[]})).status,409);
  h.dispose();h=handler({taskDirectory:directory});
  assert.deepEqual((await h.request('/task/'+task.id)).json.selectedFields,['legal_person']);
  let calls=0;const provider=createQccProvider({callTool:async()=>{calls++;return {'企业名称':'合成客户甲有限公司','法定代表人':'合成人员甲','注册地址':'合成地址'}}});
  await h.enrich(task.id,provider,scoped.json.revision);
  const ready=(await h.request('/task/'+task.id)).json;
  assert.equal(calls,1);assert.deepEqual(ready.changeSet.changes.map(c=>c.field),['legal_person']);
  assert.ok(ready.changeSet.incomplete.some(i=>i.reason==='user-excluded'));
  const output=parseWorkbook(applyChangeSet(bytes,ready.plan,ready.changeSet,{confirmChangeSetId:ready.changeSet.changeSetId}).bytes);
  assert.equal(output.sheets[0].cells.A2.value,'合成客户甲有限公司');assert.equal(output.sheets[0].cells.C2.value,'');
 }finally{h.dispose();await rm(directory,{recursive:true})}
});
function handler(options={}){
 const service=createFormFillHandler({getPort:()=>43260,...options});
 return {...service,async request(path,body){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:43260',origin:'http://127.0.0.1:43260','content-type':'application/json','x-form-fill-owner':'a'.repeat(64)}});
  let status,data;await service.handler(req,{writeHead:s=>status=s,end:b=>data=b});
  return {status,json:JSON.parse(data)};
 }};
}
test('explicit header and field correction creates only the selected opportunity',async()=>{
 const bytes=file(undefined,['单位','负责人']),configuration={sheets:['配置表'],headers:[{sheet:'配置表',row:1}],mappings:[{sheet:'配置表',column:1,field:'company_name'},{sheet:'配置表',column:2,field:'legal_person'}]};
 assert.equal((await previewBytes(bytes)).plan.calls.length,0);
 const p=await previewBytes(bytes,{configuration});
 assert.equal(p.changeSet.changes.length,1);
 assert.equal(p.changeSet.changes[0].basis,'user-mapping');
 assert.equal(parseWorkbook(applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}).bytes).sheets[0].cells.B2.value,'合成人员甲');
 for(const configuration of [{sheets:['不存在']},{headers:[{sheet:'配置表',row:99}]},{mappings:[{sheet:'配置表',column:2,field:'invented'}]},{sheets:[]},{anchors:[{sheet:'配置表',row:2,value:''}]}])assert.throws(()=>analyzeDocument(bytes,FIELD_CATALOG,configuration),{code:'CONFIG_INVALID'});
});
test('explicit null mapping excludes duplicate fields and preserves existing values',async()=>{
 const bytes=fixtureBytes('配置表',['企业名称','法人','法定代表人'],[['合成客户甲有限公司','','已有内容']],{title:false});
 const p=await previewBytes(bytes,{configuration:{headers:[{sheet:'配置表',row:1}],mappings:[{sheet:'配置表',column:3,field:null}]}});
 assert.deepEqual(p.changeSet.changes.map(c=>c.cell),['B2']);
 const out=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId});
 assert.equal(parseWorkbook(out.bytes).sheets[0].cells.C2.value,'已有内容');
});
test('configuration revision invalidates prior preview and completed task rejects edits',async()=>{
 const h=handler();try{
  const task=(await h.request('/preview',{base64:file().toString('base64')})).json;
  const updated=await h.request('/configure',{id:task.id,expectedRevision:task.revision,configuration:{headers:[{sheet:'配置表',row:1}],mappings:[{sheet:'配置表',column:2,field:null}]}});
  assert.equal(updated.status,200);assert.equal(updated.json.changeSet.changes.length,0);
  assert.equal((await h.request('/confirm',{id:task.id,expectedRevision:task.revision,confirmChangeSetId:task.changeSet.changeSetId})).status,409);
  assert.equal((await h.request('/configure',{id:task.id,expectedRevision:updated.json.revision,configuration:{anchors:[]}})).status,400);
  assert.equal((await h.request('/confirm',{id:task.id,expectedRevision:updated.json.revision,confirmChangeSetId:updated.json.changeSet.changeSetId})).status,200);
  assert.equal((await h.request('/configure',{id:task.id,expectedRevision:updated.json.revision+1,configuration:{}})).status,409);
 }finally{h.dispose()}
});
test('candidate choice is explicit, cannot be forged, persists, and does not overwrite anchor',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'form-fill-candidates-'));let h=handler({taskDirectory:directory});
 try{
  const task=(await h.request('/preview',{base64:file('合成待选主体有限公司').toString('base64')})).json;
  assert.equal(task.changeSet.changes.length,0);
  const item=task.changeSet.incomplete.find(i=>i.reason==='candidate-review-required');
  assert.equal(item.candidates.length,2);
  const request={id:task.id,expectedRevision:task.revision,sheet:'配置表',row:2};
  assert.equal((await h.request('/resolve',{...request,candidateId:'forged'})).status,400);
  assert.equal((await h.request('/resolve',{...request,value:'简称'})).status,400);
  const selected=await h.request('/resolve',{...request,candidateId:item.candidates[1].id});
  assert.equal(selected.status,200);
  assert.equal(selected.json.changeSet.changes[0].newValue,'合成人员乙');
  assert.equal((await h.request('/resolve',{...request,candidateId:item.candidates[0].id})).status,409);
  h.dispose();h=handler({taskDirectory:directory});
  const restored=(await h.request('/task/'+task.id)).json;
  assert.equal(restored.configuration.anchors[0].value,'合成客户乙有限公司');
  assert.equal(restored.changeSet.changes[0].anchor.company_name,'合成客户乙有限公司');
  const bytes=file('合成待选主体有限公司');
  const out=applyChangeSet(bytes,restored.plan,restored.changeSet,{confirmChangeSetId:restored.changeSet.changeSetId});
  assert.equal(parseWorkbook(out.bytes).sheets[0].cells.A2.value,'合成待选主体有限公司');
 }finally{h.dispose();await rm(directory,{recursive:true})}
});
test('QCC mismatch only exposes a candidate and never fills until a new exact query',async()=>{
 let calls=0;
 const provider=createQccProvider({callTool:async()=>{calls++;return {'企业名称':'合成客户乙有限公司','统一社会信用代码':'123456789012345678','法定代表人':'合成人员乙'}}});
 const bytes=file(),p=await previewBytes(bytes,{provider,confirmPaidCalls:true});
 assert.equal(p.changeSet.changes.length,0);assert.equal(calls,1);
 assert.equal(p.changeSet.incomplete[0].candidates[0].company_name,'合成客户乙有限公司');
 const selected=await previewBytes(bytes,{provider,confirmPaidCalls:true,configuration:{anchors:[{sheet:'配置表',row:2,value:'合成客户乙有限公司'}]}});
 assert.equal(calls,2);assert.equal(selected.changeSet.changes.length,1);
});
function validated(literal){
 const entries=readZip(file()),path='xl/worksheets/sheet1.xml';
 entries.set(path,Buffer.from(entries.get(path).toString().replace('</worksheet>','<dataValidations count="1"><dataValidation type="list" sqref="B2" allowBlank="1"><formula1>'+literal+'</formula1></dataValidation></dataValidations></worksheet>')));
 return writeZip(entries);
}
test('literal dropdown is preserved byte-for-byte and only permitted values are filled',async()=>{
 const bytes=validated('&quot;合成人员甲,合成人员乙&quot;'),p=await previewBytes(bytes);
 assert.equal(p.changeSet.changes.length,1);
 const out=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId});
 const before=readZip(bytes),after=readZip(out.bytes),path='xl/worksheets/sheet1.xml';
 for(const [key,value]of before)if(key!==path)assert.deepEqual(after.get(key),value);
 assert.equal(after.get(path).toString(),before.get(path).toString().replace(/<c r="B2"[\s\S]*?<\/c>/,'<c r="B2" s="0" t="inlineStr"><is><t xml:space="preserve">合成人员甲</t></is></c>'));
 assert.equal(XLSX.read(out.bytes,{type:'buffer'}).Sheets['配置表'].B2.v,'合成人员甲');
 const denied=await previewBytes(validated('&quot;其他值&quot;'));
 assert.equal(denied.changeSet.changes.length,0);
 assert.equal(denied.changeSet.incomplete[0].reason,'validation-conflict');
});
test('unsupported, missing-source and external dropdown remain rejected',()=>{
 for(const value of ['Sheet2!A1:A2','INDIRECT(A1)','[outside.xlsx]Sheet1!A1'])assert.throws(()=>parseWorkbook(validated(value)),{code:'UNSUPPORTED_STRUCTURE'});
});
test('selected worksheet is the only source of opportunities',async()=>{
 const entries=readZip(file());
 entries.set('xl/workbook.xml',Buffer.from(entries.get('xl/workbook.xml').toString().replace('</sheets>','<sheet name="第二表" sheetId="2" r:id="rId2"/></sheets>')));
 entries.set('xl/_rels/workbook.xml.rels',Buffer.from(entries.get('xl/_rels/workbook.xml.rels').toString().replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>')));
 entries.set('xl/worksheets/sheet2.xml',entries.get('xl/worksheets/sheet1.xml'));
 const p=await previewBytes(writeZip(entries),{configuration:{sheets:['第二表']}});
 assert.deepEqual(p.changeSet.changes.map(c=>c.sheet),['第二表']);
 assert.ok(p.changeSet.incomplete.some(i=>i.sheet==='配置表'&&i.reason==='sheet-excluded'));
});
test('real-source candidate confirmation changes no facts until explicitly enriched again',async()=>{
 const h=handler();try{
  const task=(await h.request('/preview',{base64:file('简称').toString('base64'),analyzeOnly:true})).json;
  let calls=0;
  const provider=createQccProvider({callTool:async()=>{calls++;return {'企业名称':'合成客户甲有限公司','法定代表人':'合成人员甲'}}});
  await h.enrich(task.id,provider,task.revision);
  let state=(await h.request('/task/'+task.id)).json;
  assert.equal(calls,0);assert.equal(state.changeSet.changes.length,0);
  const resolved=await h.request('/resolve',{id:task.id,expectedRevision:state.revision,sheet:'配置表',row:2,value:'合成客户甲有限公司'});
  assert.equal(resolved.status,200);assert.equal(calls,0);assert.equal(resolved.json.changeSet.changes.length,0);
  await h.enrich(task.id,provider,resolved.json.revision);
  state=(await h.request('/task/'+task.id)).json;
  assert.equal(calls,1);assert.equal(state.changeSet.changes.length,1);
 }finally{h.dispose()}
});
