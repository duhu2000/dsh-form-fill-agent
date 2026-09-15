import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
let loaded;vm.runInNewContext(source,{window:{__ModuleLoader__:{load:m=>loaded=m}}});
const {createInitialDraftController,INITIAL_TEMPLATE_TEXT,INITIAL_TEMPLATE_ID}=loaded.factory(()=>({}));
const id='session-dsh-form-fill-agent-a';
function fixture(overrides={}){
 let active=id,composing=false,ready=true;const listeners=new Set(),sessionListeners=new Set(),writes=[],stored=new Map();
 let state={draft:'',draftRev:0,imageIds:[],phase:'plain',occurrences:[],...overrides};
 const face={state:{getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},editor:{update:fn=>fn(),isComposing:()=>composing,getRootElement:()=>ready?{}:null},setDraft:text=>{writes.push(text);update({draft:text})}};
 function update(value){state={...state,...value,draftRev:state.draftRev+1};for(const fn of listeners)fn()}
 const options={current:()=>active,shell:()=>face,storage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},subscribeCurrent:fn=>{sessionListeners.add(fn);return()=>sessionListeners.delete(fn)}};
 return {options,face,writes,stored,listeners,update,setComposing:v=>composing=v,setReady:v=>ready=v,switchTo:v=>{active=v;for(const fn of sessionListeners)fn()},get state(){return state}};
}
test('new business empty native draft seeds once, exact fingerprint only, no send/tool/panel methods',async()=>{
 const f=fixture(),c=createInitialDraftController(f.options);c.arm(id);assert.equal(await c.attempt(id),true);assert.deepEqual(f.writes,[INITIAL_TEMPLATE_TEXT]);assert.equal(c.isTemplate(id,INITIAL_TEMPLATE_TEXT),true);
 assert.equal(c.isTemplate(id,INITIAL_TEMPLATE_TEXT+' '),false);f.update({draft:INITIAL_TEMPLATE_TEXT+'补充'});f.update({draft:INITIAL_TEMPLATE_TEXT});assert.equal(c.isTemplate(id,INITIAL_TEMPLATE_TEXT),false);
 f.update({draft:''});assert.equal(await c.attempt(id),false);c.arm(id);assert.equal(f.writes.length,1);c.dispose();assert.equal(f.listeners.size,0);
 const reloaded=createInitialDraftController(f.options);reloaded.arm(id);assert.equal(await reloaded.attempt(id),false);assert.equal(f.writes.length,1);
 assert.equal(INITIAL_TEMPLATE_ID,'dsh-initial-draft/form-fill/1');
});
for(const [name,initial] of [['text',{draft:'已有要求'}],['whitespace',{draft:' '}],['attachments',{imageIds:['image']}],['references',{occurrences:[{}]}],['submission',{phase:'submitting'}]])test(name+' consumes eligibility',async()=>{
 const f=fixture(initial),c=createInitialDraftController(f.options);c.arm(id);f.update({draft:'',imageIds:[],occurrences:[],phase:'plain'});assert.equal(await c.attempt(id),false);assert.equal(f.writes.length,0);
});
for(const change of ['text','attachment','IME','clear','switch'])test('second-snapshot race: '+change,async()=>{
 const f=fixture();let finish;const c=createInitialDraftController({...f.options,defer:fn=>new Promise(resolve=>finish=()=>resolve(fn()))});c.arm(id);const pending=c.attempt(id);
 if(change==='text')f.update({draft:'用户'});if(change==='attachment')f.update({imageIds:['x']});if(change==='IME')f.setComposing(true);if(change==='clear'){f.update({draft:'编辑'});f.update({draft:''})}if(change==='switch'){f.switchTo('normal');f.switchTo(id)}finish();assert.equal(await pending,false);assert.equal(f.writes.length,0);
});
test('mount readiness, initial IME, old/non-business Sessions, remount and capability degradation',async()=>{
 for(const kind of ['ime','old','normal','other','missing','unmounted']){
  const f=fixture(),c=createInitialDraftController(f.options);
  if(kind==='ime')f.setComposing(true);if(kind==='missing')delete f.face.editor.isComposing;if(kind==='unmounted')f.setReady(false);
  if(kind!=='old')c.arm(kind==='normal'?'normal':kind==='other'?'session-dsh-data-cleaning-a':id);
  assert.equal(await c.attempt(id),false);c.expire(id);f.setReady(true);f.setComposing(false);assert.equal(await c.attempt(id),false);assert.equal(f.writes.length,0);c.dispose();
 }
});
test('late mounted input may seed only without interim user changes; A/B independent',async()=>{
 const f=fixture();f.setReady(false);const c=createInitialDraftController(f.options);c.arm(id);assert.equal(await c.attempt(id),false);f.setReady(true);assert.equal(await c.attempt(id),true);
 const b=fixture(),other=createInitialDraftController(b.options);other.arm(id);other.dispose();assert.equal(await other.attempt(id),false);assert.equal(b.writes.length,0);
});

test('business guidance contribution is isolated across all four products and diagnostics',async()=>{
 const {initialGuidanceSection}=await import('../packages/dsh-form-fill-agent/lib/index.js');
 const policy=initialGuidanceSection({agent:{session:{id}}});
 assert.match(policy,/未上传 Excel|主体定位列/);assert.match(policy,/不创建任务/);assert.match(policy,/不调用 form_fill_enrich/);
 for(const value of [undefined,'ordinary','session-dsh-data-cleaning-agent-a','session-dsh-pre-duediligence-a','session-dsh-tender-workbench-a'])assert.equal(initialGuidanceSection({agent:{session:{id:value}}}),'');
 assert.equal(initialGuidanceSection({}),'');
});
