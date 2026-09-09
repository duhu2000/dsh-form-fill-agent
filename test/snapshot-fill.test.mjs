import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogProvider,FIELD_CATALOG} from 'qcc-form-fill-provider';
import {projectFirstSnapshot} from '../packages/qcc-form-fill-provider/lib/snapshot-fields.js';
import {analyzeDocument,buildFillPlan,executePlan,applyChangeSet,parseWorkbook} from 'form-fill-core';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
const data={企业名称:'合成测试有限公司',财务数据信息:[{报告期:'2025',指标详情:{主要财务指标:{营业总收入:0,总资产:'100万元'}}},{报告期:'2024',指标详情:{主要财务指标:{利润总额:999}}}]};
test('first snapshot does not combine records and retains zero',()=>{
 const p=projectFirstSnapshot(data,'get_financial_data');assert.equal(p.values.financial_total_revenue,0);assert.equal(p.values.financial_total_profit,undefined);
 assert.equal(projectFirstSnapshot({受益所有人信息:{受益所有人:[{受益所有人名称:'甲'},{受益所有人名称:'乙'}]}},'get_beneficial_owners').values.beneficial_owner_first_name,'甲');
 assert.deepEqual(projectFirstSnapshot({财务数据信息:[{指标详情:{主要财务指标:{营业总收入:123}}}]},'get_financial_data').values,{});
});
test('snapshot provider fills original blanks and exposes first reporting period',async()=>{
 const bytes=fixtureBytes('测试',['企业名称','营业总收入','总资产'],[['合成测试有限公司','','已有值']],{title:false});
 const {analysis}=analyzeDocument(bytes,FIELD_CATALOG);const calls=[];
 const provider=createCatalogProvider({availableTools:['get_financial_data'],callTool:async(tool,args)=>{calls.push(tool);return tool==='get_company_registration_info'?{企业名称:args.searchKey}:data}});
 const plan=buildFillPlan(analysis,provider.capabilities,provider.version),changes=await executePlan(plan,provider,{confirmPaidCalls:true});
 assert.equal(changes.changes.length,1);assert.equal(changes.changes[0].newValue,'0');
 assert.match(JSON.stringify(changes.changes),/reportPeriod=2025/);
 assert.deepEqual(calls,['get_company_registration_info','get_financial_data']);
 const out=applyChangeSet(bytes,plan,changes,{confirmChangeSetId:changes.changeSetId});assert.equal(parseWorkbook(out.bytes).sheets[0].cells.C2.value,'已有值');
});
