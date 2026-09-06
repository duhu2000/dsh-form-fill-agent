import test from 'node:test';
import assert from 'node:assert/strict';
import { createQccProvider } from 'qcc-form-fill-provider';
import { previewBytes } from 'dsh-form-fill-agent';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
const anchor='合成测试有限公司';
const call={capability:'qcc-registration',anchor:{company_name:anchor},fields:['credit_no','legal_person']};
test('QCC contract supports text/structured data and exact original values',async()=>{
  for (const wrap of [x=>({content:[{type:'text',text:JSON.stringify(x)}]}),x=>({structuredContent:x})]) {
    let calls=0;
    const p=createQccProvider({callTool:async(name,args)=>{calls++;assert.equal(name,'get_company_registration_info');assert.deepEqual(args,{searchKey:anchor});return wrap({'企业名称':anchor,'统一社会信用代码':'SYNTHETIC-CODE','法定代表人':'合成人员'});}});
    const r=await p.lookup(call);assert.equal(r.status,'exact');assert.equal(r.values.credit_no.value,'SYNTHETIC-CODE');assert.match(r.values.credit_no.source,/get_company_registration_info/);assert.equal(calls,1);
  }
});
test('QCC rejects abbreviation and unknown fields before dispatch',async()=>{
  let count=0;const p=createQccProvider({callTool:()=>{count++;}});
  assert.equal((await p.lookup({...call,anchor:{company_name:'合成品牌'}})).status,'ambiguous');
  assert.equal((await p.lookup({...call,fields:['unknown']})).status,'error');assert.equal(count,0);
});
test('QCC distinguishes missing, mismatch, malformed, failed and timeout',async()=>{
  for(const [raw,status] of [[{无匹配项:true},'not-found'],[{'企业名称':'另一合成有限公司'},'ambiguous'],[{isError:true},'error'],[{content:[{type:'text',text:'bad'}]},'error']])
    assert.equal((await createQccProvider({callTool:async()=>raw}).lookup(call)).status,status);
  assert.equal((await createQccProvider({callTool:async()=>{throw Error('secret upstream');}}).lookup(call)).code,'qcc-call-failed');
  assert.equal((await createQccProvider({callTool:()=>new Promise(()=>{}),timeoutMs:5}).lookup(call)).code,'qcc-timeout');
});
test('authorized QCC pipeline fills only returned fields; no transport without authorization',async()=>{
  const bytes=fixtureBytes('合成契约',['企业名称','信用代码','法定代表人'],[[anchor,'','']]);
  let calls=0;const provider=createQccProvider({callTool:async()=>{calls++;return {'企业名称':anchor,'统一社会信用代码':'SYNTHETIC-CODE'};}});
  await assert.rejects(previewBytes(bytes,{provider}),{code:'REAL_PROVIDER_DISABLED'});assert.equal(calls,0);
  const p=await previewBytes(bytes,{provider,confirmPaidCalls:true});
  assert.equal(p.changeSet.changes.length,1);assert.equal(p.changeSet.incomplete.length,1);assert.equal(p.changeSet.incomplete[0].reason,'no-data');assert.equal(calls,1);
});
