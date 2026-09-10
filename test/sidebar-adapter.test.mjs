import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
let module;vm.runInNewContext(source,{window:{__ModuleLoader__:{load:d=>module=d}}});
const {createSidebarAdapter}=module.factory(()=>({}));
const id='dsh-form-fill-agent:workbench';
function fixture(){
 let descriptor,active='A';const listeners=new Set(),states=new Map(),closed=[];
 const state=()=>({splits:{kind:'leaf',tabs:[{id:'files'}]},bottomSplits:{kind:'leaf',tabs:[]},floats:[],panelOpen:false,bottomOpen:false,width:500});
 states.set('A',state());states.set('B',state());
 const service={version:'0.17.1',features:['targetedOpen','stateSubscription'],registerTab:d=>{descriptor=d;return()=>descriptor=undefined},isTabEnabled:()=>true,
  openTab:(_seed,scope)=>{const s=states.get(scope.sessionId);if(!s.splits.tabs.some(t=>t.id===id))s.splits.tabs.push({id});},closeTab:(tab,scope)=>{closed.push([tab,scope.sessionId]);states.get(scope.sessionId).splits.tabs=states.get(scope.sessionId).splits.tabs.filter(t=>t.id!==tab)},
  getSnapshot:()=>({sessionId:active,state:states.get(active)}),subscribeState:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 const store={reduce:fn=>{states.set(active,fn(states.get(active)));for(const fn of listeners)fn()}};
 return {service,store,states,closed,listeners,get descriptor(){return descriptor},activate:s=>{active=s;for(const fn of listeners)fn()}};
}
test('single session tab, deferred reveal, host collapse, bottom/float ownership and cleanup',()=>{
 const f=fixture(),a=createSidebarAdapter(f.service,()=>null,null);
 assert.equal(f.descriptor.single,true);assert.equal(f.descriptor.id,id);
 a.open({sessionId:'A'});const detach=a.attach({sessionId:'A'},f.store,{id});
 a.open({sessionId:'A'});assert.equal(f.states.get('A').splits.tabs.length,2);assert.equal(f.states.get('A').panelOpen,true);
 f.states.get('A').panelOpen=false;a.open({sessionId:'A'});assert.equal(f.states.get('A').panelOpen,true);
 a.open({sessionId:'B'});a.attach({sessionId:'B'},f.store,{id});assert.equal(f.states.get('B').panelOpen,false);
 const previous=f.states.get('A');f.activate('B');assert.equal(f.states.get('B').panelOpen,true);assert.equal(f.states.get('A'),previous);
 const s=f.states.get('B');s.splits.tabs=[];s.bottomSplits.tabs=[{id}];a.open({sessionId:'B'});assert.equal(f.states.get('B').bottomOpen,true);
 f.states.get('B').floats=[{tab:{id}}];f.states.get('B').panelOpen=false;f.states.get('B').bottomOpen=false;a.open({sessionId:'B'});assert.equal(f.states.get('B').panelOpen,false);
 detach();a.dispose();a.dispose();assert.equal(f.listeners.size,0);assert.equal(f.descriptor,undefined);assert.ok(f.closed.every(([tab])=>tab===id));assert.equal(f.states.get('A').splits.tabs[0].id,'files');
});
test('missing/old/incomplete companion is actionable, never registers a fallback',()=>{
 for(const mutation of [s=>undefined,s=>({...s,version:'0.17.0'}),s=>({...s,version:'0.19.0'}),s=>({...s,features:['targetedOpen']}),s=>({...s,subscribeState:undefined})]){
  const f=fixture();assert.throws(()=>createSidebarAdapter(mutation(f.service),()=>null),/按安装说明选择版本/);assert.equal(f.descriptor,undefined);
 }
 assert.doesNotMatch(source,/展开工作台|关闭工作台|ff-panel|ResizeObserver|shell\.overlay|padding-right/);
});
