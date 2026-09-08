import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTaskStore } from '../packages/dsh-form-fill-agent/lib/task-store.js';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
import { previewBytes } from 'dsh-form-fill-agent';
import { applyChangeSet } from 'form-fill-core';
test('mapping roles, duplicate positions and scope survive store restart without defaults',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'form-fill-mapping-store-'));t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true})});
 const bytes=fixtureBytes('合成映射',['企业名称','企业名称','法定代表人','法人'],[['合成客户甲有限公司','','','']],{title:false});
 const configuration={headers:[{sheet:'合成映射',row:1}],mappings:[{sheet:'合成映射',column:1,field:'company_name',role:'input'},{sheet:'合成映射',column:2,field:'company_name',role:'output'},...[3,4].map(column=>({sheet:'合成映射',column,field:'legal_person'}))]};
 const selectedFields=['company_name','legal_person'],preview=await previewBytes(bytes,{configuration,selectedFields}),id=randomUUID();
 let store=createTaskStore({directory});store.set(id,{bytes,configuration,selectedFields,preview,owner:'e'.repeat(64),sessionId:'synthetic-mapping',created:Date.now()});store.close();
 store=createTaskStore({directory});
 assert.deepEqual(store.get(id).configuration,configuration);assert.deepEqual(store.get(id).selectedFields,selectedFields);assert.deepEqual(store.get(id).preview,preview);assert.equal(store.get(id).sessionId,'synthetic-mapping');
});
test('persistent task restores preview and confirmed artifact without provider calls',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'form-fill-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bytes=fixtureBytes('合成测试',['企业名称','信用代码'],[['合成客户甲有限公司','']]);
  const preview=await previewBytes(bytes),id=randomUUID();
  let store=createTaskStore({directory:dir});
  store.set(id,{bytes,preview,created:Date.now()});
  assert.throws(()=>createTaskStore({directory:dir}),/already in use/);
  if(process.platform!=='win32')assert.equal((await stat(join(dir,id+'.json'))).mode&0o777,0o600);
  store.close();store=createTaskStore({directory:dir});
  assert.deepEqual(store.get(id).preview,preview);
  const result=applyChangeSet(bytes,preview.plan,preview.changeSet,{confirmChangeSetId:preview.changeSet.changeSetId});
  store.set(id,{...store.get(id),result});store.close();store=createTaskStore({directory:dir});
  assert.deepEqual(store.get(id).result.bytes,result.bytes);
  store.delete(id);store.close();store=createTaskStore({directory:dir});assert.equal(store.size,0);store.close();
});
test('expired persistent tasks are removed on restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'form-fill-expired-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bytes=fixtureBytes('合成测试',['企业名称','信用代码'],[['合成客户甲有限公司','']]);
  const store=createTaskStore({directory:dir,now:()=>0});
  store.set(randomUUID(),{bytes,preview:await previewBytes(bytes),created:0});store.close();
  const restored=createTaskStore({directory:dir,now:()=>2000,ttlMs:1000});assert.equal(restored.size,0);restored.close();
});

test('legacy schema migration preserves data and interrupted owned tasks recover',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'form-fill-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bytes=fixtureBytes('合成测试',['企业名称','信用代码'],[['合成客户甲有限公司','']]),id=randomUUID();
  let store=createTaskStore({directory:dir});
  store.set(id,{bytes,preview:await previewBytes(bytes),created:Date.now()});store.close();
  const path=join(dir,id+'.json'),legacy=JSON.parse(await readFile(path,'utf8'));
  legacy.schema=1;delete legacy.revision;await writeFile(path,JSON.stringify(legacy));
  store=createTaskStore({directory:dir});
  assert.equal(store.get(id).revision,1);assert.deepEqual(store.get(id).bytes,bytes);
  store.set(id,{...store.get(id),owner:'a'.repeat(64),state:'enriching',sessionId:'synthetic-session',revision:2});store.close();
  store=createTaskStore({directory:dir});
  assert.equal(store.get(id).state,'interrupted');assert.equal(store.get(id).owner,'a'.repeat(64));
  assert.equal(store.get(id).sessionId,'synthetic-session');assert.equal(store.get(id).revision,2);
  store.close();
});
