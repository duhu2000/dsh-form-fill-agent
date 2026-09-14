import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createFormFillHandler } from '../packages/dsh-form-fill-agent/lib/http.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const source = await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
const entry = `
import React from 'react';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
let active=localStorage.getItem('active')||'normal', draft='',normalStarts=0;const listeners=new Set();
const components={},cleanups=[];
const ctx={
 sessions:{list:{getSnapshot:()=>({current:active}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},create:async args=>args.sessionId||'normal-'+crypto.randomUUID(),open:async id=>{active=id;localStorage.setItem('active',id);for(const fn of listeners)fn();render()}},
 workspaces:{list:{getSnapshot:()=>({items:[{workspaceId:'synthetic-workspace',sessionIds:[active]}],recentWorkspaceId:'synthetic-workspace'})},startSession:()=>{normalStarts++}},
 conversation:{input:{shell:()=>({setDraft:text=>{draft=text;document.querySelector('textarea').value=text;return true}})}},
 slots:{inject:(_name,fn)=>fn(),register:(options,component)=>{components[options.name]=component}},
 effect:fn=>cleanups.push(fn())
};
window.__ModuleLoader__={load:def=>def.factory(name=>name==='react'?React:ReactDOM).apply(ctx)};
${source}
const h=React.createElement,root=createRoot(document.getElementById('root'));
function slot(name){return components[name]?h(components[name],{sessionId:active}):null}
function render(){root.render(h(React.Fragment,null,
 h('aside',null,h('button',{onClick:()=>ctx.workspaces.startSession('synthetic-workspace')},'新会话'),h('div',{'data-slot':'sidebar.workspaces'},'工作区'),slot('sidebar.footer.action')),
 h('main',{'data-slot':'conversation','data-phase':'hero'},h('div',null,h('span',{className:'fishHitbox'},'host logo'),h('h1',{className:'headlineText'},'探索未至之境')),h('div',{'data-composer-seat':''},
 h('div',null,h('div',{'data-native-options':''},h('button',null,'workspace'),h('button',null,'标准模式')),h('div',{'data-composer-card':''},h('textarea',{'aria-label':'原生输入框'}),slot('conversation.input.overlay'))),slot('conversation.input.dock'))),
 slot('shell.overlay')))}
window.probe={get active(){return active},get draft(){return draft},get normalStarts(){return normalStarts},open:id=>ctx.sessions.open(id),get listeners(){return listeners.size},switchNormal:()=>ctx.sessions.open('normal'),dispose:()=>cleanups.forEach(fn=>fn?.())};render();
`;
const built=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'native-harness.jsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
let server;const service=createFormFillHandler({basePath:'/form-fill',getPort:()=>server.address().port});
server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><style>*{box-sizing:border-box}body{margin:0}textarea{width:100%;height:100px}main{width:100%}</style><div id="root"></div><script src="/harness.js"></script></html>')}else if(req.url==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text)}else service.handler(req,res)});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));assert.notEqual(server.address().port,43120);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('link',{name:'AI 填表',exact:true}).click();
 await page.locator('.ff-hero h1').waitFor();
 assert.equal(await page.locator('.ff-hero h1').innerText(),'AI 填表智能体');
 assert.equal(await page.locator('.ff-hero p').count(),0);
 assert.equal(await page.locator('.headlineText').isVisible(),false);
 const owned=await page.evaluate(()=>probe.active);
 for(const dark of [false,true])for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(dark=>document.documentElement.toggleAttribute('data-ds-dark-theme',dark),dark);
  const order=await page.evaluate(()=>{const y=s=>document.querySelector(s).getBoundingClientRect().top;return [y('.ff-hero'),y('[data-native-options]'),y('[data-composer-card]'),y('.ff-shortcuts')]});
  assert.ok(order.every((v,i)=>i===0||v>order[i-1]),JSON.stringify(order));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.locator('textarea').fill('保留用户草稿');
 await page.getByRole('button',{name:'导入表格',exact:true}).click();
 assert.equal(await page.locator('textarea').inputValue(),'保留用户草稿');
 assert.equal(await page.getByRole('link',{name:'AI 填表',exact:true}).innerText(),'AI 填表');
 // Host replaces its welcome subtree without a Session change.
 await page.locator('.headlineText').evaluate(e=>{const parent=e.parentElement;const next=parent.cloneNode(true);next.style.display='';parent.replaceWith(next)});
 await page.waitForFunction(()=>document.querySelectorAll('.ff-hero').length===1&&getComputedStyle(document.querySelector('.headlineText')).display!=='none'&&document.querySelector('.headlineText').parentElement.style.display==='none');
 // A custom title must remain visible and never be rewritten by this bridge.
 await page.locator('.headlineText').evaluate(e=>{e.textContent='用户自定义标题'});
 await page.locator('.ff-hero').waitFor({state:'detached'});
 assert.equal(await page.locator('.headlineText').innerText(),'用户自定义标题');
 assert.equal(await page.locator('.headlineText').isVisible(),true);
 await page.locator('.headlineText').evaluate(e=>{e.textContent='探索未至之境'});
 await page.locator('.ff-hero').waitFor();
 await page.evaluate(()=>probe.open('session-dsh-previsit-foreign'));
 await page.locator('.ff-hero').waitFor({state:'detached'});
 assert.equal(await page.locator('.headlineText').isVisible(),true);
 await page.evaluate(id=>probe.open(id),owned);await page.locator('.ff-hero').waitFor();
 await page.reload();await page.locator('.ff-hero').waitFor();
 await page.getByRole('button',{name:'新会话',exact:true}).click();
 await page.locator('.ff-hero').waitFor({state:'detached'});
 assert.equal(await page.locator('.headlineText').isVisible(),true);
 await page.evaluate(id=>probe.open(id),owned);await page.locator('.ff-hero').waitFor();
 await page.evaluate(()=>probe.dispose());await page.locator('.ff-hero').waitFor({state:'detached'});
 assert.equal(await page.locator('.headlineText').isVisible(),true);
 assert.equal(await page.evaluate(()=>probe.listeners),0);
 const taskPage=await browser.newPage();await taskPage.goto('http://127.0.0.1:'+server.address().port+'/form-fill/');
 for(const [state,confirmed,label] of [['enriching',false,'处理中'],['preview_ready',false,'等待核验与确认'],['cancelled',false,'已停止但未完成'],['completed',true,'已完成']]){
  await taskPage.evaluate(({state,confirmed})=>{current={id:'synthetic-state',state,confirmed,changeSet:{incomplete:[]},presentation:{running:state==='enriching',ended:state!=='enriching',percent:50,completed:1,total:2,elapsedMs:1000,outcomes:{}}};syncActions()},{state,confirmed});
  assert.ok((await taskPage.locator('#progress-label').innerText()).startsWith(label));
 }
 await taskPage.evaluate(async()=>{history.replaceState(null,'','#task=missing-synthetic-task');await restore(true)});
 assert.ok((await taskPage.locator('#execution-progress').innerText()).startsWith('状态同步异常'));
 assert.equal(await taskPage.locator('#task-progress').getAttribute('value'),'50');
 await taskPage.close();
 assert.deepEqual(errors,[]);
 console.log('Home contract PASS: no subtitle; native controls order; 2 themes x 2 widths; host replacement; custom title; A/foreign/normal; refresh; cleanup. Synthetic React host only.');
}finally{await browser.close();service.dispose();await new Promise(ok=>server.close(ok))}
