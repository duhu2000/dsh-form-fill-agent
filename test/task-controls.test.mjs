import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
import {createQccProvider} from 'qcc-form-fill-provider';
function service(directory){const h=createFormFillHandler({getPort:()=>43263,taskDirectory:directory});return {...h,async request(path,body,owner='a'.repeat(64)){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:43263',origin:'http://127.0.0.1:43263','content-type':'application/json','x-form-fill-owner':owner}});let status,data;await h.handler(req,{writeHead:s=>status=s,end:b=>data=b});return {status,json:JSON.parse(data)};
}};}
test('candidate selection can be restored repeatedly after restart; grid covers later rows and columns',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'form-fill-grid-test-'));let h=service(dir);
 try{
 const rows=Array.from({length:121},(_,i)=>['合成客户甲有限公司','',...Array.from({length:19},(_,j)=>i===120&&j===18?'尾行尾列':'值')]);
 const bytes=fixtureBytes('分页表',['企业名称','法定代表人',...Array.from({length:19},(_,i)=>'其他'+i)],rows,{title:false});
 let task=(await h.request('/preview',{base64:bytes.toString('base64')})).json;
 const ids=task.candidates.map(c=>c.id);assert.equal(ids.length,121);
 task=(await h.request('/select',{id:task.id,expectedRevision:task.revision,selectedIds:[ids[0]]})).json;
 assert.equal(task.changeSet.changes.length,1);assert.equal(task.candidates.length,121);
 h.dispose();h=service(dir);task=(await h.request('/task/'+task.id)).json;
 assert.equal(task.selectedIds.length,1);assert.equal(task.candidates.length,121);
 task=(await h.request('/select',{id:task.id,expectedRevision:task.revision,selectedIds:ids})).json;
 assert.equal(task.changeSet.changes.length,121);assert.equal(task.changeSet.incomplete.filter(i=>i.reason==='user-excluded').length,0);
 const grid=(await h.request('/grid/'+task.id+'?q='+encodeURIComponent('尾行尾列')+'&columnStart=17')).json;
 assert.equal(grid.totalRows,122);assert.equal(grid.totalColumns,21);assert.equal(grid.rows[0].number,122);assert.equal(grid.rows[0].cells.at(-1).value,'尾行尾列');
 const original=(await h.request('/grid/'+task.id+'?pageSize=2')).json,result=(await h.request('/grid/'+task.id+'?pageSize=2&view=result')).json;
 assert.equal(original.rows[1].cells[1].value,'');assert.equal(result.rows[1].cells[1].value,'合成人员甲');
 assert.equal((await h.request('/grid/'+task.id,undefined,'b'.repeat(64))).status,404);
 assert.equal((await h.request('/grid/'+task.id+'?pageSize=10001')).status,400);
 }finally{h.dispose();await rm(dir,{recursive:true})}
});
test('cancel checkpoints successes; restart and retry dispatch only unfinished calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'form-fill-cancel-test-'));let h=service(dir);
 try{
 const names=['合成客户甲有限公司','合成客户乙有限公司','合成供应商甲有限公司'];
 let task=(await h.request('/preview',{base64:fixtureBytes('取消表',['企业名称','法定代表人'],names.map(n=>[n,'']),{title:false}).toString('base64'),analyzeOnly:true})).json;
 let entered;const pending=new Promise(ok=>entered=ok);let calls=0;
 const provider=createQccProvider({callTool:async(_,{searchKey},{signal})=>{calls++;if(calls===2){entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))}return {'企业名称':searchKey,'法定代表人':'合成人员'}}});
 const run=h.enrich(task.id,provider,task.revision);await pending;
 task=(await h.request('/task/'+task.id)).json;assert.equal(task.progress.completed,1);assert.equal(task.changeSet.changes.length,1);
 assert.equal((await h.request('/cancel',{id:task.id,expectedRevision:task.revision},'b'.repeat(64))).status,404);
 assert.equal((await h.request('/cancel',{id:task.id,expectedRevision:task.revision})).status,200);await run;
 task=(await h.request('/task/'+task.id)).json;assert.equal(task.state,'cancelled');assert.equal(calls,2);
 h.dispose();h=service(dir);task=(await h.request('/task/'+task.id)).json;assert.equal(task.changeSet.changes.length,1);
 const retryNames=[];const retry=createQccProvider({callTool:async(_,{searchKey})=>{retryNames.push(searchKey);return {'企业名称':searchKey,'法定代表人':'重试合成人员'}}});
 await h.enrich(task.id,retry,task.revision,{retryOnly:true});task=(await h.request('/task/'+task.id)).json;
 assert.deepEqual(retryNames,names.slice(1));assert.equal(task.changeSet.changes.length,3);assert.equal(task.changeSet.changes[0].newValue,'合成人员');
 await h.enrich(task.id,retry,task.revision,{retryOnly:true});assert.equal(retryNames.length,2);
 }finally{h.dispose();await rm(dir,{recursive:true})}
});
