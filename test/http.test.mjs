import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createFormFillHandler } from '../packages/dsh-form-fill-agent/lib/http.js';
import { parseWorkbook } from 'form-fill-core';
const bytes = await readFile(new URL('../fixtures/xlsx/客户台账.xlsx', import.meta.url));
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
for (const basePath of ['', '/form-fill']) test('HTTP full lifecycle ' + (basePath || 'standalone'), async t => {
  const h=harness({basePath}); t.after(h.dispose);
  assert.equal((await h.request(basePath+'/')).status,200);
  assert.deepEqual((await h.request(basePath+'/fixture/'+encodeURIComponent('客户台账'))).data,bytes);
  const preview=await h.request(basePath+'/preview',{base64:bytes.toString('base64')});
  assert.equal(preview.status,200);
  const p=preview.json(), path=basePath+'/download/'+p.id;
  assert.equal(p.changeSet.changes.length,6);
  assert.equal((await h.request(path+'/xlsx')).status,404);
  assert.equal((await h.request(basePath+'/confirm',{id:p.id,confirmChangeSetId:'wrong'})).status,409);
  const confirmation={id:p.id,confirmChangeSetId:p.changeSet.changeSetId};
  const result=await h.request(basePath+'/confirm',confirmation);
  assert.equal(result.status,200); assert.equal(result.json().filled,6);
  assert.deepEqual((await h.request(basePath+'/confirm',confirmation)).json(),result.json());
  const output=await h.request(path+'/xlsx');
  assert.equal(output.status,200); assert.ok(parseWorkbook(output.data).sheets.length);
  assert.notDeepEqual(output.data,bytes);
  assert.equal((await h.request(path+'/changes')).json().appliedChanges.length,6);
  assert.equal((await h.request(path+'/incomplete')).json().length,6);
  assert.equal((await h.request(basePath+'/discard',{id:p.id})).status,200);
  assert.equal((await h.request(path+'/xlsx')).status,404);
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
