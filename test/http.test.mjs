import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createFormFillHandler } from '../packages/dsh-form-fill-agent/lib/http.js';
import { parseWorkbook } from 'form-fill-core';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';
const bytes = await readFile(new URL('../fixtures/xlsx/客户台账.xlsx', import.meta.url));
test('real Host can resolve the client manifest through package exports',async()=>{
  const require=createRequire(import.meta.url);
  const manifest=JSON.parse(await readFile(require.resolve('dsh-form-fill-agent/package.json'),'utf8'));
  assert.equal(manifest.exports['./client'],'./lib/client.js');
  assert.deepEqual(manifest.dsh.client.inject,['@deepseek-ai/dsh-client-ui-layout','@deepseek-ai/dsh-client-ui-conversation']);
});
function harness(options = {}) {
  const service = createFormFillHandler({ getPort: () => 43260, ...options });
  async function request(path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
    Object.assign(req, { url: path, method, headers: { host: '127.0.0.1:43260', origin: 'http://127.0.0.1:43260', 'content-type': 'application/json', ...headers } });
    let status, responseHeaders, data;
    await service.handler(req, { writeHead(s,h) { status=s; responseHeaders=h; }, end(b) { data=Buffer.from(b); } });
    return { status, headers: responseHeaders, data, json: () => JSON.parse(data) };
  }
  return { ...service, request };
}
test('duplicate output positions have independent selection, restoration and owner boundaries',async t=>{
 const h=harness();t.after(h.dispose);const headers={'x-form-fill-owner':'c'.repeat(64)};
 const synthetic=fixtureBytes('重复位置',['企业名称','法定代表人','法人'],[['合成客户甲有限公司','','']],{title:false});
 let p=(await h.request('/preview',{base64:synthetic.toString('base64')},headers)).json();
 p=(await h.request('/configure',{id:p.id,expectedRevision:p.revision,configuration:{headers:[{sheet:'重复位置',row:1}],mappings:[2,3].map(column=>({sheet:'重复位置',column,field:'legal_person'}))}},headers)).json();
 assert.equal(p.changeSet.changes.length,2);const ids=p.changeSet.changes.map(c=>c.id);assert.equal(new Set(ids).size,2);
 p=(await h.request('/select',{id:p.id,expectedRevision:p.revision,selectedIds:[ids[1]]},headers)).json();
 assert.equal(p.changeSet.changes[0].cell,'C2');
 p=(await h.request('/task/'+p.id,undefined,headers)).json();assert.equal(p.changeSet.changes.length,1);
 assert.equal((await h.request('/task/'+p.id,undefined,{'x-form-fill-owner':'d'.repeat(64)})).status,404);
 p=(await h.request('/select',{id:p.id,expectedRevision:p.revision,selectedIds:ids},headers)).json();assert.equal(p.changeSet.changes.length,2);
 p=(await h.request('/select',{id:p.id,expectedRevision:p.revision,selectedIds:[ids[0]]},headers)).json();
 const confirmed=await h.request('/confirm',{id:p.id,expectedRevision:p.revision,confirmChangeSetId:p.changeSet.changeSetId},headers);
 assert.equal(confirmed.status,200);assert.equal(confirmed.json().filled,1);
});
for (const basePath of ['', '/form-fill']) test('HTTP full lifecycle ' + (basePath || 'standalone'), async t => {
  const h=harness({basePath}); t.after(h.dispose);
  assert.equal((await h.request(basePath+'/')).status,200);
  assert.deepEqual((await h.request(basePath+'/fixture/'+encodeURIComponent('客户台账'))).data,bytes);
  const preview=await h.request(basePath+'/preview',{base64:bytes.toString('base64')});
  assert.equal(preview.status,200);
  const p=preview.json(), path=basePath+'/download/'+p.id;
  assert.equal(p.changeSet.changes.length,6);
  assert.equal((await h.request(path+'/xlsx')).status,404);
  assert.equal((await h.request(path+'/report')).status,404);
  assert.equal((await h.request(basePath+'/confirm',{id:p.id,confirmChangeSetId:'wrong'})).status,409);
  const confirmation={id:p.id,confirmChangeSetId:p.changeSet.changeSetId};
  const result=await h.request(basePath+'/confirm',confirmation);
  assert.equal(result.status,200); assert.equal(result.json().filled,6);
  assert.deepEqual((await h.request(basePath+'/confirm',confirmation)).json(),result.json());
  const output=await h.request(path+'/xlsx');
  assert.equal(output.status,200); assert.ok(parseWorkbook(output.data).sheets.length);
  assert.notDeepEqual(output.data,bytes);
  assert.equal((await h.request(path+'/report')).status,200);
  assert.equal((await h.request(path+'/report-preview')).json().rows.length,12);
  assert.equal((await h.request(path+'/changes')).json().appliedChanges.length,6);
  assert.equal((await h.request(path+'/incomplete')).json().length,6);
  assert.equal((await h.request(basePath+'/discard',{id:p.id})).status,200);
  assert.equal((await h.request(path+'/xlsx')).status,404);
  assert.equal((await h.request(path+'/report')).status,404);
});
test('HTTP rejects invalid input, origin, host and forbidden port',async t=>{
  const h=harness();t.after(h.dispose);
  for(const body of ['{', 'null', '[]', {base64:'?bad'}, {base64:'AB=='}])
    assert.equal((await h.request('/preview',body)).status,400);
  for(const headers of [{host:'evil.invalid:43260'},{origin:'https://evil.invalid'},{origin:undefined},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])
    assert.equal((await h.request('/preview',{},headers)).status,403);
  assert.equal((await h.request('/confirm',' '.repeat(4097))).status,413);
  assert.equal((await h.request('/fixture/../secret')).status,404);
  const blocked=harness({getPort:()=>43120});t.after(blocked.dispose);
  assert.equal((await blocked.request('/health')).status,403);
});
test('HTTP capacity, expiry and disposal release task state',async t=>{
  let time=0;const h=harness({maxTasks:1,ttlMs:1000,now:()=>time});t.after(h.dispose);
  const body={base64:bytes.toString('base64')};
  const responses=await Promise.all([h.request('/preview',body),h.request('/preview',body)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,429]);
  const id=responses.find(r=>r.status===200).json().id;
  time=1001;
  assert.equal((await h.request('/confirm',{id})).status,404);
  assert.equal((await h.request('/preview',body)).status,200);
  h.dispose();assert.equal((await h.request('/health')).status,503);
});
test('native entry needs no sessions or third-party companion and degrades safely',async()=>{
  const source=await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
  let definition;vm.runInNewContext(source,{window:{__ModuleLoader__:{load:d=>definition=d}}});
  let registered,render;
  const plugin=definition.factory(()=>({createElement:(...args)=>args}));
  plugin.apply({slots:{inject:(name,callback)=>callback(),register:(options,component)=>{registered=options;render=component;}}});
  assert.equal(registered.name,'sidebar.footer.action');assert.equal(render()[1].href,'/form-fill/');
  assert.doesNotThrow(()=>plugin.apply({}));
  assert.doesNotThrow(()=>definition.factory(()=>{throw Error('missing React');}).apply({}));
});

test('scoped history, revision conflicts and selected cells are enforced',async t=>{
 const h=harness();t.after(h.dispose);
 const owner='a'.repeat(64),headers={'x-form-fill-owner':owner};
 const p=(await h.request('/preview',{base64:bytes.toString('base64'),filename:'台账.xlsx'},headers)).json();
 assert.equal((await h.request('/tasks')).status,403);
 assert.equal((await h.request('/tasks',undefined,{'x-form-fill-owner':'b'.repeat(64)})).json().length,0);
 assert.equal((await h.request('/task/'+p.id)).status,404);
 const list=(await h.request('/tasks',undefined,headers)).json();
 assert.equal(list.length,1);assert.equal(list[0].filename,'台账.xlsx');assert.equal(list[0].plan,undefined);
 assert.equal((await h.request('/confirm',{id:p.id,confirmChangeSetId:p.changeSet.changeSetId},headers)).status,409);
 const selected=await h.request('/select',{id:p.id,expectedRevision:p.revision,selectedIds:[p.changeSet.changes[0].id]},headers);
 assert.equal(selected.status,200);const q=selected.json();assert.equal(q.changeSet.changes.length,1);assert.equal(q.revision,2);
 assert.equal((await h.request('/confirm',{id:p.id,expectedRevision:p.revision,confirmChangeSetId:p.changeSet.changeSetId},headers)).status,409);
 const confirmed=await h.request('/confirm',{id:p.id,expectedRevision:q.revision,confirmChangeSetId:q.changeSet.changeSetId},headers);
 assert.equal(confirmed.status,200);assert.equal(confirmed.json().filled,1);
});
test('actual upload analysis does not use synthetic facts',async t=>{
 const h=harness();t.after(h.dispose);
 const p=await h.request('/preview',{base64:bytes.toString('base64'),analyzeOnly:true});
 assert.equal(p.status,200);assert.equal(p.json().changeSet.changes.length,0);assert.equal(p.json().plan.estimatedCalls,0);
});
