// Interactive bridge: the orchestrator supplies the company and fresh MCP result via stdin.
// Never writes the company name, response, workbook or preview to the repository.
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { fixtureBytes } from './generate-fixtures.mjs';
import { createQccProvider } from 'qcc-form-fill-provider';
import { previewBytes } from 'dsh-form-fill-agent';
import { applyChangeSet, parseWorkbook } from 'form-fill-core';
const lines=createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator]();
const configuration=JSON.parse((await lines.next()).value);
let calls=0;
const provider=createQccProvider({callTool:async(name,args)=>{
  calls++; console.log(JSON.stringify({kind:'mcp-request',name,arguments:args}));
  return JSON.parse((await lines.next()).value);
}});
const input=fixtureBytes('验证表',['企业名称','信用代码','法定代表人','成立日期','注册地址','登记状态','登记机关'],[[configuration.company,'','','','','','']]);
const preview=await previewBytes(input,{provider,confirmPaidCalls:true,maxCalls:1});
assert.equal(calls,1);assert.equal(preview.changeSet.changes.length,6);
assert.ok(preview.changeSet.changes.every(c=>c.source.startsWith('qcc://get_company_registration_info/')));
const out=applyChangeSet(input,preview.plan,preview.changeSet,{confirmChangeSetId:preview.changeSet.changeSetId});
assert.equal(out.changes.length,6);assert.ok(parseWorkbook(out.bytes).sheets.length);
assert.equal((await previewBytes(out.bytes,{provider,confirmPaidCalls:true})).changeSet.changes.length,0);
assert.equal(calls,1);
console.log(JSON.stringify({kind:'live-qcc-fill',result:'PASS',calls,filled:6,secondPassChanges:0,rawDataPersisted:false}));
process.exit(0);
