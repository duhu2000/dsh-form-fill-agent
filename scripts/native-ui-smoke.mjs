import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createFormFillHandler } from '../packages/dsh-form-fill-agent/lib/http.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const source = await readFile(new URL('../packages/dsh-form-fill-agent/lib/client.js',import.meta.url),'utf8');
const entry = `
import React from 'react';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
let active='normal', draft='',normalStarts=0;
const components={},cleanups=[];
const ctx={
 sessions:{list:{getSnapshot:()=>({current:active})},create:async args=>args.sessionId||'normal-'+crypto.randomUUID(),open:async id=>{active=id;render()}},
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
 h('aside',null,slot('sidebar.footer.action'),h('button',{onClick:()=>ctx.workspaces.startSession('synthetic-workspace')},'新会话')),
 h('main',{'data-slot':'conversation'},h('div',{'data-composer-seat':''},
 h('div',null,h('div',{'data-composer-card':''},h('textarea',{'aria-label':'原生输入框'}),slot('conversation.input.overlay'))),slot('conversation.input.dock'))),
 slot('shell.overlay')))}
window.probe={get active(){return active},get draft(){return draft},get normalStarts(){return normalStarts},switchNormal:()=>ctx.sessions.open('normal'),dispose:()=>cleanups.forEach(fn=>fn?.())};render();
`;
const built=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'native-harness.jsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
let server;const service=createFormFillHandler({basePath:'/form-fill',getPort:()=>server.address().port});
server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><style>*{box-sizing:border-box}body{margin:0}textarea{width:100%;height:100px}main{width:100%}</style><div id="root"></div><script src="/harness.js"></script></html>')}else if(req.url==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text)}else service.handler(req,res)});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));assert.notEqual(server.address().port,43120);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 assert.equal(await page.getByRole('button',{name:'导入表格',exact:true}).count(),0);
 await page.getByRole('link',{name:'▦ AI填表'}).click();
 await page.getByRole('button',{name:'导入表格',exact:true}).waitFor();
 const id=await page.evaluate(()=>probe.active);assert.match(id,/^session-dsh-form-fill-agent-/);
 await page.getByRole('button',{name:'导入表格',exact:true}).click();
 const frame=page.frameLocator('iframe');
 await frame.locator('details').evaluate(e=>e.open=true);
 await frame.getByRole('button',{name:'客户台账',exact:true}).click();
 await frame.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
 assert.equal(await frame.locator('#changes tr').count(),6);
 await page.getByRole('button',{name:'主体核验',exact:true}).click();
 await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
 await frame.locator('#requirements').fill('只补工商字段');
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await page.waitForFunction(()=>probe.draft.includes('form_fill_enrich'));
 assert.match(await page.evaluate(()=>probe.draft),/expectedRevision=1/);
 assert.equal(await page.evaluate(()=>probe.active),id);
 await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
 await page.getByRole('button',{name:'填写预览',exact:true}).click();
 await frame.locator('#changes tr').nth(5).waitFor();
 for(const size of [{width:1440,height:900},{width:390,height:700}]){
  await page.setViewportSize(size);
  await page.waitForTimeout(100);
  const panel=await page.getByRole('region',{name:'AI填表工作台'}).boundingBox();
  assert.ok(panel.x>=-1&&panel.x+panel.width<=size.width+1);
 }
 await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
 await page.getByRole('button',{name:'新会话',exact:true}).click();
 await page.waitForFunction(()=>probe.active.startsWith('normal-'));
 assert.equal(await page.getByRole('button',{name:'导入表格',exact:true}).count(),0);
 await page.getByRole('button',{name:'新会话',exact:true}).click();
 assert.equal(await page.evaluate(()=>probe.normalStarts),1);assert.deepEqual(errors,[]);
 console.log('Native React contract: owned session, navigation, draft, task restore, responsive panel, normal NewSession PASS; not a real Host/model E2E');
}finally{await browser.close();service.dispose();await new Promise(ok=>server.close(ok))}
