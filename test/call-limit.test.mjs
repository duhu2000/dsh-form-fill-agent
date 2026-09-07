import test from 'node:test';
import assert from 'node:assert/strict';
import { previewBytes, configuredCallLimit } from '../packages/dsh-form-fill-agent/lib/workflow.js';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';

test('call limit configuration is explicit and validates invalid values',()=>{
 assert.equal(configuredCallLimit(''),Infinity);
 assert.equal(configuredCallLimit('0'),Infinity);
 assert.equal(configuredCallLimit('200'),200);
 for(const value of ['-1','oops','1.5','Infinity'])assert.throws(()=>configuredCallLimit(value),{code:'CALL_LIMIT_CONFIG'});
});
test('more than 100 grouped calls work without implicit cap; explicit cap blocks before lookup',async()=>{
 const bytes=fixtureBytes('合成预算',['企业名称','法定代表人','登记状态'],Array.from({length:101},(_,i)=>['合成主体'+i,'','']),{title:false});
 let calls=0;
 const provider={mode:'mock',version:'synthetic',capabilities:[{id:'registration',fields:['legal_person','business_status'],paid:false}],lookup:async()=>{calls++;return {status:'not-found'}}};
 const result=await previewBytes(bytes,{provider,maxCalls:configuredCallLimit('0')});
 assert.equal(result.plan.estimatedCalls,101);assert.equal(calls,101);
 calls=0;
 await assert.rejects(previewBytes(bytes,{provider,maxCalls:100}),{code:'BUDGET_EXCEEDED',message:/预计 101 次调用.*本地插件上限 100/});
 assert.equal(calls,0);
});
