import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as projections from '../packages/qcc-form-fill-provider/lib/projections.js';
import {QCC_FIELD_CATALOG} from '../packages/qcc-form-fill-provider/lib/catalog.js';
import {createCatalogProvider,FIELD_CATALOG,CATALOG_TOOL_DOMAINS} from 'qcc-form-fill-provider';
import {previewBytes} from 'dsh-form-fill-agent';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
const golden=JSON.parse(await readFile(new URL('../fixtures/extended-provider.golden.json',import.meta.url)));
test('all 128 legacy catalog entries preserve labels, sources and release semantics',()=>{assert.deepEqual(QCC_FIELD_CATALOG,golden.catalog);assert.equal(QCC_FIELD_CATALOG.flatMap(g=>g.fields).length,128)});
for(const row of golden.cases)test('pre-extraction parity '+row.tool+' / '+row.variant,()=>assert.deepEqual(projections[row.mapper](row.input),row.expected));
test('all catalog batches fill only selected fields after exact identity and missing tools degrade',async()=>{
 assert.equal(FIELD_CATALOG.length,137);
 for(const group of golden.catalog.slice(1)){
  const row=golden.cases.find(c=>c.tool===group.sourceTool&&c.variant==='full'),calls=[];
  const input={...row.input,...(row.input.企业名称?{企业名称:'合成扩展有限公司'}:{})},expected=projections[row.mapper](input);
  const provider=createCatalogProvider({availableTools:Object.keys(CATALOG_TOOL_DOMAINS),callTool:async(name,args)=>{calls.push(name);return name==='get_company_registration_info'?{企业名称:args.searchKey,统一社会信用代码:'SYNTHETIC000000001'}:input}});
  const bytes=fixtureBytes('合成扩展',['企业名称',...group.fields.map(f=>f.label)],[['合成扩展有限公司',...group.fields.map(()=> '')]],{title:false});
  const preview=await previewBytes(bytes,{provider,confirmPaidCalls:true});
  assert.deepEqual(calls,['get_company_registration_info',group.sourceTool]);assert.equal(preview.plan.estimatedCalls,2);
  for(const change of preview.changeSet.changes)assert.equal(change.newValue,String(expected[change.field]));
  assert.ok(preview.changeSet.changes.length>0);
 }
 const provider=createCatalogProvider({callTool:()=>{throw Error('must not run')}});
 assert.equal(provider.capabilities.length,1);
});
test('risk catalog drift fails closed and abbreviation never dispatches domain tool',async()=>{
 const calls=[],provider=createCatalogProvider({availableTools:['get_company_risk_scan'],callTool:async(name,args)=>{calls.push(name);return name==='get_company_registration_info'?{企业名称:args.searchKey}:{风险因子扫描:[{风险因子:'新增因子',条目数:1}]}}});
 const request={capability:'qcc-get_company_risk_scan',anchor:{company_name:'合成扩展有限公司'},fields:['risk_dishonest_count']};
 assert.equal((await provider.lookup(request)).code,'qcc-catalog-drift');assert.equal(calls.length,2);
 assert.equal((await provider.lookup({...request,anchor:{company_name:'合成'}})).status,'ambiguous');assert.equal(calls.length,2);
});
test('credit-only table uses provider-declared fallback anchor and preserves the code',async()=>{
 const code='SYNTHETIC000000001',calls=[];
 const provider=createCatalogProvider({availableTools:['get_tax_invoice_info'],callTool:async(name,args)=>{calls.push([name,args.searchKey]);return name==='get_company_registration_info'?{企业名称:'合成扩展有限公司',统一社会信用代码:code}:{企业名称:'合成扩展有限公司',开户行:'合成银行'}}});
 const p=await previewBytes(fixtureBytes('代码表',['统一社会信用代码','开户行'],[[code,'']],{title:false}),{provider,confirmPaidCalls:true});
 assert.deepEqual(p.analysis.tables[0].anchors,['credit_no']);assert.equal(p.changeSet.changes.length,1);assert.equal(p.changeSet.changes[0].cell,'B2');
 assert.deepEqual(calls,[['get_company_registration_info',code],['get_tax_invoice_info',code]]);
});
test('known added disciplinary dimension is explicit while arbitrary catalog drift still fails',async()=>{
 const input=structuredClone(golden.cases.find(c=>c.tool==='get_company_related_risk_scan'&&c.variant==='full').input);input.维度计数汇总.重要风险.惩戒名单='2';
 const p=createCatalogProvider({availableTools:['get_company_related_risk_scan'],callTool:async(name,args)=>name==='get_company_registration_info'?{企业名称:args.searchKey}:input});
 const result=await p.lookup({capability:'qcc-get_company_related_risk_scan',anchor:{company_name:'合成扩展有限公司'},fields:['related_risk_disciplinary_list_count','related_risk_summary']});
 assert.equal(result.values.related_risk_disciplinary_list_count.value,'2');assert.match(result.values.related_risk_summary.value,/惩戒名单\(2\)/);
});
