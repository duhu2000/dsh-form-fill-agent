// Real Better Sidebar service/state + real React and form-fill HTTP page.
// The surrounding host chrome is synthetic; this is not a real DSH claim.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
const root=process.env.SIDEBAR_SOURCE;
assert.ok(root,'SIDEBAR_SOURCE must point to installed dsh-better-sidebar');
const source=await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
const entry=`
import React from 'react';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
import {createSidebarStore,allLeaves} from '${root}/src/client/state.ts';
import {createBetterSidebarService} from '${root}/src/client/service.ts';
const store=createSidebarStore(),service=createBetterSidebarService(store),h=React.createElement;
let active='normal',draft='',creates=0,disposed=false;const components={},cleanups=[];
store.setSession(active);service.registerTab({id:'files',title:'Files',single:true,component:()=>h('p',null,'Files content')});
const ctx={sessions:{list:{getSnapshot:()=>({current:active})},create:async args=>{creates++;return args.sessionId||'normal'},open:async id=>{active=id;store.setSession(id);render()}},
workspaces:{list:{getSnapshot:()=>({items:[{workspaceId:'test',sessionIds:[active],path:'/tmp/synthetic'}],recentWorkspaceId:'test'})}},
conversation:{input:{shell:()=>({setDraft:v=>{draft=v;document.querySelector('textarea').value=v;return true},state:{getSnapshot:()=>({draft})}})}},
slots:{inject:(_n,fn)=>fn(),register:(o,c)=>components[o.name]=c},effect:fn=>cleanups.push(fn()),
inject:(deps,fn)=>{if(deps.includes('betterSidebar')&&!location.search.includes('missing'))fn({...ctx,betterSidebar:service})}};
window.__ModuleLoader__={load:def=>def.factory(name=>name==='react'?React:ReactDOM).apply(ctx)};
${source}
const reactRoot=createRoot(document.getElementById('root'));
function slot(n){return !disposed&&components[n]?h(components[n],{sessionId:active}):null}
function Host(){const snap=React.useSyncExternalStore(fn=>store.subscribe(fn),()=>store.getSnapshot()),s=snap.state;
const tabs=allLeaves(s.splits).flatMap(p=>p.tabs),selected=allLeaves(s.splits).find(p=>p.tabs.length)?.active;
return h(React.Fragment,null,h('aside',null,h('div',{'data-slot':'sidebar.workspaces'},'工作区'),slot('sidebar.footer.action')),
h('main',{'data-slot':'conversation','data-phase':'hero'},h('div',{'data-composer-seat':''},h('div',null,h('div',{'data-composer-card':''},h('textarea',{'aria-label':'原生输入框'}),slot('conversation.input.overlay'))),slot('conversation.input.dock'))),
h('button',{onClick:()=>store.reduce(s=>({...s,panelOpen:!s.panelOpen}))},'宿主展开收起'),h('button',{onClick:()=>service.openTab({type:'files'},{sessionId:active})},'打开 Files'),
h('section',{id:'host-sidebar',hidden:!s.panelOpen},h('nav',null,...tabs.map(t=>h(React.Fragment,{key:t.id},h('button',{onClick:()=>service.openTab({type:t.type},{sessionId:active})},t.title),h('button',{'aria-label':'宿主关闭 '+t.title,onClick:()=>service.closeTab(t.id,{sessionId:active})},'×')))),
...tabs.map(t=>{const d=service.getTab(t.type);return d?h('div',{key:t.id,hidden:t.id!==selected,className:'host-tab'},h(d.component,{scope:{sessionId:active},store,tab:t,visible:s.panelOpen&&t.id===selected})):null})));}
function render(){reactRoot.render(h(Host))}store.subscribe(render);service.subscribe(render);render();
window.probe={store,service,get active(){return active},get creates(){return creates},get draft(){return draft},setDraft:value=>{draft=value;document.querySelector('textarea').value=value},dispose:()=>{disposed=true;cleanups.forEach(fn=>fn?.());render()}};
`;
const built=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'sidebar-harness.js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
let server;let mutations=0;const service=createFormFillHandler({basePath:'/form-fill',getPort:()=>server.address().port});
server=createServer((req,res)=>{if(req.method==='POST')mutations++;if(req.url==='/'||req.url==='/?missing'){res.setHeader('Content-Type','text/html');res.end('<html><style>*{box-sizing:border-box}body{margin:0}main{width:40%;min-width:0}textarea{width:100%;height:100px}#host-sidebar{position:fixed;right:0;top:0;bottom:0;width:60%;display:flex;flex-direction:column}.host-tab{flex:1;min-height:0}#host-sidebar[hidden],.host-tab[hidden]{display:none}</style><div id="root"></div><script src="/harness.js"></script></html>')}else if(req.url==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text)}else service.handler(req,res)});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('link',{name:'AI填表',exact:true}).click();
 const menu=page.getByRole('navigation',{name:'AI填表快捷菜单'});
 await menu.waitFor();assert.equal(await page.locator('iframe').count(),0);
 await menu.getByRole('button',{name:'导入表格',exact:true}).click();
 const frame=page.frameLocator('iframe[title="AI填表任务"]');await frame.locator('#file').waitFor();
 await frame.getByText('体验合成模板',{exact:true}).click();await frame.getByRole('button',{name:'客户台账',exact:true}).click();
 await frame.locator('#task-meta').filter({hasText:'客户台账'}).waitFor();
 const task=await frame.locator('body').evaluate(()=>location.hash),baseline=mutations;
 for(const [label,step] of [['导入表格','import'],['字段设置','rules'],['主体核验','identity'],['填写预览','preview'],['任务历史','history']]){
  await menu.getByRole('button',{name:label,exact:true}).click();await menu.getByRole('button',{name:label,exact:true}).click();
  if(step==='history')await frame.locator('#history').waitFor();else await frame.locator('[data-pane="'+step+'"]').first().waitFor();
  assert.equal(await page.locator('iframe').count(),1);
 }
 assert.equal(mutations,baseline);assert.equal(await page.evaluate(()=>probe.creates),1);
 await page.getByRole('button',{name:'打开 Files',exact:true}).click();await page.getByText('Files content',{exact:true}).waitFor();
 await menu.getByRole('button',{name:'字段设置',exact:true}).click();await frame.locator('#mapping').waitFor();
 await page.getByRole('button',{name:'宿主展开收起',exact:true}).click();assert.equal(await page.locator('#host-sidebar').isVisible(),false);
 await menu.getByRole('button',{name:'字段设置',exact:true}).click();await frame.locator('#mapping').waitFor();
 const pendingField=frame.locator('#mapping select[data-column]').last();await pendingField.locator('xpath=ancestor::details').locator('summary').click();await pendingField.selectOption('reg_capital');
 await page.getByRole('button',{name:'宿主关闭 AI填表',exact:true}).click();assert.equal(await page.locator('iframe').count(),0);
 await menu.getByRole('button',{name:'字段设置',exact:true}).click();await frame.locator('#mapping').waitFor();
 assert.equal(await frame.locator('#mapping select[data-column]').last().inputValue(),'reg_capital','unapplied mapping draft survives Tab X');
 await menu.getByRole('button',{name:'填写预览',exact:true}).click();await frame.locator('#summary').waitFor();
 assert.equal(await frame.locator('body').evaluate(()=>location.hash),task);assert.equal(mutations,baseline);
 assert.equal(await page.getByRole('button',{name:'展开工作台',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'关闭工作台',exact:true}).count(),0);
 for(const dark of [false,true])for(const width of [320,640,900]){
  await page.locator('#host-sidebar').evaluate((n,w)=>n.style.width=w+'px',width);await page.evaluate(d=>document.documentElement.toggleAttribute('data-ds-dark-theme',d),dark);
  assert.equal(await page.locator('.ff-tab-content').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await page.screenshot({path:'/tmp/ff-sidebar-'+(dark?'dark':'light')+'-'+width+'.png'});
 }
 await page.evaluate(()=>probe.dispose());assert.equal(await page.locator('iframe').count(),0);assert.ok(await page.getByRole('button',{name:'Files',exact:true}).count());
 await page.goto('http://127.0.0.1:'+server.address().port+'/?missing');await page.getByRole('link',{name:'AI填表',exact:true}).click();await menu.getByRole('button',{name:'导入表格',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'安装或升级'}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS real sidebar service/state, singleton, Files, collapse, close/reopen, no mutation, theme/width, cleanup, missing dependency');
}finally{await browser.close();server.close();service.dispose()}
