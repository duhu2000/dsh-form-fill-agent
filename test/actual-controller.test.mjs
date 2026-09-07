import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTUAL_CONTROLLER_GROUP as group,projectActualController as project} from 'qcc-field-contracts';
import {createCatalogProvider,FIELD_CATALOG} from 'qcc-form-fill-provider';
import {analyzeDocument,buildFillPlan,executePlan,applyChangeSet,parseWorkbook} from 'form-fill-core';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
const row={实际控制人名称:'合成控制人甲',直接持股比例:'35.4938%',总持股比例:'47.6955%',表决权比例:'53%'};
const response=(rows=[row],more={})=>({企业名称:'合成测试有限公司',实际控制人信息:rows,total_count:rows.length,has_more:false,next_cursor:null,...more});
const fields=group.fields.map(f=>f.id);
test('shared controller projection: exact strings, zero, missing, multi, pagination, malformed and cardinality',()=>{
 assert.equal(project(response()).values.actual_controller_total_ratio,'47.6955%');
 assert.equal(project(response([{...row,直接持股比例:'0%'}])).values.actual_controller_direct_ratio,'0%');
 for(const data of [response([row,row]),response([row],{has_more:true}),response([row],{next_cursor:'more'}),response([row],{total_count:2}),response([row],{has_more:undefined}),{},response([null])]){
  assert.deepEqual(project(data).values,{});assert.equal(Object.keys(project(data).issues).length,4);
 }
 assert.equal(project(response([])).issues.actual_controller_name.code,'no-record');
 const missing=project(response([{...row,总持股比例:null}]));
 assert.equal(missing.values.actual_controller_name,row.实际控制人名称);assert.equal(missing.issues.actual_controller_total_ratio.code,'not-disclosed');
 assert.equal(project(response([{...row,总持股比例:{value:'47%'}}])).issues.actual_controller_total_ratio.code,'invalid-value');
});
test('provider + XLSX core fill matching original blank columns, preserve filled cells, report field-level review',async()=>{
 const headers=['企业名称','企业实控人名称（自然人请填写姓名）','实际控制人总持股比例','实际控制人表决权比例'];
 const bytes=fixtureBytes('实控人测试',headers,[['合成测试有限公司','','','原值保留']],{title:false});
 const {analysis}=analyzeDocument(bytes,FIELD_CATALOG);
 assert.equal(analysis.tables[0].mappings[1].field,'actual_controller_name');
 let data=response();const calls=[];
 const provider=createCatalogProvider({availableTools:['get_actual_controller'],callTool:async(tool,args)=>{
  calls.push(tool);return tool==='get_company_registration_info'?{企业名称:args.searchKey}:data;
 }});
 const plan=buildFillPlan(analysis,provider.capabilities,provider.version);
 const change=await executePlan(plan,provider,{confirmPaidCalls:true});
 assert.deepEqual(change.changes.map(x=>[x.cell,x.newValue]),[['B2','合成控制人甲'],['C2','47.6955%']]);
 assert.deepEqual(calls,['get_company_registration_info','get_actual_controller']);
 const out=applyChangeSet(bytes,plan,change,{confirmChangeSetId:change.changeSetId});
 assert.equal(parseWorkbook(out.bytes).sheets[0].cells.D2.value,'原值保留');
 data=response([row,{...row,实际控制人名称:'合成控制人乙'}]);
 const multi=await executePlan(plan,provider,{confirmPaidCalls:true});
 assert.equal(multi.changes.length,0);
 assert.ok(multi.incomplete.every(x=>x.reason==='field-review-required'&&x.detail.includes('多名')));
 assert.equal(createCatalogProvider({availableTools:[],callTool:async()=>{throw Error('must not call')}}).capabilities.some(x=>x.fields.includes(fields[0])),false);
});
