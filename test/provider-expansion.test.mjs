import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createQccProvider,decodeCandidates,ENTITY_TOOL,REGISTRATION_TOOL} from 'qcc-form-fill-provider';
const fixture=JSON.parse(await readFile(new URL('../fixtures/registration-contract.golden.json',import.meta.url)));
test('registration golden preserves all 26 original scalar values without numeric conversion',async()=>{
 const provider=createQccProvider({callTool:async()=>({企业名称:fixture.company,...fixture.source})});
 const result=await provider.lookup({capability:'qcc-registration',anchor:{company_name:fixture.company},fields:fixture.expectedFields});
 assert.equal(result.status,'exact');assert.deepEqual(Object.keys(result.values),fixture.expectedFields);
 for(const fact of Object.values(result.values))assert.equal(fact.value,fixture.source[fact.source.split('/').at(-1)]);
 assert.equal(result.values.reg_capital.value,'123.456789万元');
});
test('candidate contract requires explicit choice, handles fallback, never guesses first match',async()=>{
 const calls=[];const candidates={匹配结果:'多候选',企业信息:[{企业名称:'合成契约有限公司',统一社会信用代码:'SYNTHETIC'}]};
 const provider=createQccProvider({enableEntitySearch:true,callTool:async(name,args)=>{calls.push([name,args.searchKey]);return name===ENTITY_TOOL?candidates:{无匹配项:true}}});
 assert.equal((await provider.lookup({capability:'qcc-registration',anchor:{company_name:'合成'},fields:['credit_no']})).status,'ambiguous');
 assert.deepEqual(calls,[[ENTITY_TOOL,'合成']]);
 assert.equal((await provider.lookup({capability:'qcc-registration',anchor:{company_name:fixture.company},fields:['credit_no']})).status,'ambiguous');
 assert.deepEqual(calls.slice(1),[[REGISTRATION_TOOL,fixture.company],[ENTITY_TOOL,fixture.company]]);
 assert.equal(provider.capabilities[0].maxCallsPerLookup,2);
 assert.equal(decodeCandidates({匹配结果:'唯一精确匹配',企业信息:candidates.企业信息}).status,'error');
 assert.equal(decodeCandidates({匹配结果:'唯一精确匹配',企业信息:candidates.企业信息[0]}).status,'ambiguous');
 assert.equal(decodeCandidates({匹配结果:'未匹配'}).status,'not-found');
 const branch=decodeCandidates({匹配结果:'多候选',企业信息:[...candidates.企业信息,{企业名称:'合成契约有限公司测试分公司',统一社会信用代码:'SYNTHETIC000000001'}]});
 assert.equal(branch.status,'ambiguous');assert.equal(branch.candidates.length,2,'a branch name must not invalidate the entire live candidate list');
});
test('cancellation settles even when transport ignores AbortSignal',async()=>{
 const provider=createQccProvider({callTool:()=>new Promise(()=>{})});const controller=new AbortController();
 const pending=provider.lookup({capability:'qcc-registration',anchor:{company_name:fixture.company},fields:['credit_no']},{signal:controller.signal});controller.abort();
 assert.deepEqual(await pending,{status:'cancelled'});
});
