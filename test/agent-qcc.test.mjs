import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../packages/dsh-form-fill-agent/lib/index.js';
import { Readable } from 'node:stream';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
test('Agent-owned QCC tool enriches uploaded task and preserves nested execution context',async()=>{
 let handler,tool,calls=0;const effects=[];
 const exec={agent:{id:'synthetic-agent'},token:{id:'synthetic-token'},rootCallId:'synthetic-root'};
 const tools={
   get:name=>name==='mcp__qcc-company__get_company_registration_info'?{name}:undefined,
   register:definition=>{tool=definition;return()=>{};},
   execute:async request=>{calls++;assert.equal(request.agent,exec.agent);assert.equal(request.parent,exec.token);assert.equal(request.rootCallId,exec.rootCallId);return {value:{content:[{type:'text',text:JSON.stringify({'企业名称':'合成真实路径有限公司','统一社会信用代码':'SYNTHETIC-LIVE-CONTRACT'})}]}};}
 };
 const scope={tools,webServer:{port:43260,register:r=>{handler=r.handler;return()=>{};}},effect:f=>effects.push(f()),inject:(deps,f)=>f(scope)};
 apply(scope);
 async function request(path,body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
   Object.assign(req,{url:'/form-fill'+path,method:body?'POST':'GET',headers:{host:'127.0.0.1:43260',origin:'http://127.0.0.1:43260','content-type':'application/json'}});
   let status,data;await handler(req,{writeHead:s=>status=s,end:b=>data=JSON.parse(b)});
   return {status,data};
 }
 try {
   const bytes=fixtureBytes('合成验证',['企业名称','信用代码'],[['合成真实路径有限公司','']]);
   const p=await request('/preview',{base64:bytes.toString('base64')});assert.equal(calls,0);
   await assert.rejects(tool.execute({taskId:p.data.id},{}),/Agent-owned/);assert.equal(calls,0);
   const result=await tool.execute({taskId:p.data.id},exec);assert.equal(result.filled,1);assert.equal(calls,1);
   assert.deepEqual(Object.keys(result).sort(),['diagnostics','filled','incomplete','previewPath','taskId']);
   assert.match(tool.output.render({},result)[0].text,/尚未写入副本/);
   const restored=await request('/task/'+p.data.id);
   assert.equal(restored.data.changeSet.changes[0].newValue,'SYNTHETIC-LIVE-CONTRACT');
   assert.equal((await request('/confirm',{id:p.data.id,confirmChangeSetId:p.data.changeSet.changeSetId})).status,409);
 }finally{effects.reverse().forEach(f=>f?.());}
});
