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
 h('aside',null,h('button',{onClick:()=>ctx.workspaces.startSession('synthetic-workspace')},'新会话'),h('div',{'data-slot':'sidebar.workspaces'},'工作区'),slot('sidebar.footer.action')),
 h('main',{'data-slot':'conversation','data-phase':'hero'},h('div',null,h('span',{className:'fishHitbox'},'host logo'),h('h1',{className:'headlineText'},'探索未至之境')),h('div',{'data-composer-seat':''},
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
 await page.getByRole('link',{name:'AI填表',exact:true}).click();
 await page.getByRole('button',{name:'导入表格',exact:true}).waitFor();
 await page.locator('.ff-hero h1').waitFor();
 assert.equal(await page.locator('.ff-hero h1').innerText(),'AI填表智能体');
 assert.ok(await page.locator('[data-form-fill-top]').evaluate(e=>e.nextElementSibling.dataset.slot==='sidebar.workspaces'));
 assert.equal(await page.locator('.headlineText').isVisible(),false);
 for(const dark of [false,true])for(const width of [320,390,640,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(dark=>document.documentElement.toggleAttribute('data-ds-dark-theme',dark),dark);
  const menu=page.getByRole('navigation',{name:'AI填表快捷菜单'});
  const layout=await menu.evaluate(nav=>({count:nav.children.length,overflow:document.documentElement.scrollWidth>innerWidth,inside:!nav.closest('[data-composer-card]'),items:[...nav.children].map(b=>{const r=b.getBoundingClientRect(),i=b.querySelector('svg').getBoundingClientRect(),l=b.querySelector('.ff-shortcut-label').getBoundingClientRect();return {top:r.top,height:r.height,border:getComputedStyle(b).borderTopWidth,iconBottom:i.bottom,labelTop:l.top}})}));
  assert.equal(layout.count,5);assert.equal(layout.overflow,false);assert.equal(layout.inside,true);
  for(const item of layout.items){assert.ok(item.height>=54);assert.equal(item.top,layout.items[0].top);assert.equal(item.border,'1px');assert.ok(item.iconBottom<=item.labelTop)}
  await menu.evaluate(n=>n.scrollLeft=n.scrollWidth);
  assert.ok(await menu.getByRole('button',{name:'任务历史',exact:true}).isVisible());
  await menu.evaluate(n=>n.scrollLeft=0);
  if(process.env.FORM_FILL_SCREENSHOTS){await mkdir(process.env.FORM_FILL_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.FORM_FILL_SCREENSHOTS+'/home-'+(dark?'dark':'light')+'-'+width+'.png'})}
 }
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>document.documentElement.removeAttribute('data-ds-dark-theme'));
 if(process.env.FORM_FILL_SCREENSHOTS){await mkdir(process.env.FORM_FILL_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.FORM_FILL_SCREENSHOTS+'/home.png'})}
 const id=await page.evaluate(()=>probe.active);assert.match(id,/^session-dsh-form-fill-agent-/);
 await page.getByRole('button',{name:'导入表格',exact:true}).click();
 const frame=page.frameLocator('iframe');
 await frame.locator('body.ff-embedded').waitFor();assert.equal(await frame.locator('.ff-workbench-head').isVisible(),false);
 assert.equal(await frame.locator('.ff-execution-toolbar').isVisible(),false);
 const divider=page.getByRole('separator',{name:'调整工作台宽度'});
 const widthNow=()=>divider.getAttribute('aria-valuenow').then(Number);
 const baseline=await widthNow();
 await divider.focus();await page.keyboard.press('ArrowLeft');assert.equal(await widthNow(),baseline+16);
 await page.keyboard.press('Shift+ArrowRight');assert.equal(await widthNow(),baseline-32);
 await page.keyboard.press('Home');assert.equal(await widthNow(),320);
 assert.equal(await page.locator('.ff-panel-head').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await page.keyboard.press('End');assert.equal(await widthNow(),1020);
 assert.equal(await page.locator('[data-form-fill-reserve]').evaluate(e=>e.getBoundingClientRect().width-parseFloat(getComputedStyle(e).paddingRight)),420);
 await divider.dblclick();assert.equal(await widthNow(),baseline);
 const start=await divider.boundingBox();await page.mouse.move(start.x+4,start.y+200);await page.mouse.down();await page.mouse.move(start.x-96,start.y+200);
 assert.equal(await widthNow(),baseline+100);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await widthNow(),baseline);
 await page.mouse.move(start.x+4,start.y+200);await page.mouse.down();await page.mouse.move(start.x-76,start.y+200);await page.mouse.up();assert.equal(await widthNow(),baseline+80);
 await page.getByRole('button',{name:'展开工作台',exact:true}).click();assert.equal(await widthNow(),1020);
 await page.getByRole('button',{name:'收起展开',exact:true}).click();assert.equal(await widthNow(),baseline+80);
 await page.getByRole('button',{name:'关闭工作台',exact:true}).click();assert.equal(await page.locator('[data-form-fill-reserve]').count(),0);
 await page.getByRole('button',{name:'导入表格',exact:true}).click();assert.equal(await widthNow(),baseline+80);
 await page.setViewportSize({width:900,height:900});await page.waitForFunction(()=>document.querySelector('[role=separator]').getAttribute('aria-valuenow')==='480');
 await page.setViewportSize({width:700,height:900});await divider.waitFor({state:'hidden'});assert.equal(await page.locator('[data-form-fill-reserve]').count(),0);
 await page.setViewportSize({width:1440,height:900});await divider.waitFor();assert.equal(await widthNow(),baseline+80);
 await divider.dblclick();
 for(const cancel of ['blur','pointercancel']){
  await page.evaluate(()=>document.documentElement.setAttribute('data-ds-dark-theme',''));
  const box=await divider.boundingBox();await page.mouse.move(box.x+4,box.y+200);await page.mouse.down();await page.mouse.move(box.x-46,box.y+200);
  await page.evaluate(cancel=>cancel==='blur'?window.dispatchEvent(new Event('blur')):document.querySelector('[role=separator]').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true})),cancel);
  await page.mouse.up();assert.equal(await widthNow(),baseline);
 }
 await page.evaluate(()=>document.documentElement.removeAttribute('data-ds-dark-theme'));
 await page.locator('main').evaluate(e=>{e.style.marginLeft='280px';e.style.width='calc(100% - 280px)'});
 await page.waitForFunction(()=>document.querySelector('[role=separator]').getAttribute('aria-valuemax')==='740');
 await divider.focus();await page.keyboard.press('End');assert.equal(await widthNow(),740);
 await page.locator('main').evaluate(e=>{e.style.marginLeft='';e.style.width=''});
 await page.waitForFunction(()=>document.querySelector('[role=separator]').getAttribute('aria-valuemax')==='1020');
 await divider.dblclick();
 if(process.env.FORM_FILL_SCREENSHOTS)await page.screenshot({path:process.env.FORM_FILL_SCREENSHOTS+'/workbench.png'});
 await frame.locator('details:has(#samples)').evaluate(e=>e.open=true);
 await frame.getByRole('button',{name:'客户台账',exact:true}).click();
 await frame.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
 assert.equal(await frame.locator('#changes tr').count(),6);
 await page.getByRole('button',{name:'主体核验',exact:true}).click();
 await page.getByRole('textbox',{name:'原生输入框'}).fill('保留我的手写要求');
 await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.ff-panel').getBoundingClientRect().width===innerWidth);
 const modalPanel=await page.getByRole('region',{name:'AI填表工作台'}).boundingBox();assert.equal(modalPanel.width,1440);
 await frame.getByRole('button',{name:'3 填写字段',exact:true}).click();
 await frame.locator('#field-search').fill('法定');
 assert.equal(await frame.locator('#wizard-fields label:visible').count(),1);
 await frame.locator('#field-search').fill('');
 await page.evaluate(()=>document.documentElement.setAttribute('data-ds-dark-theme',''));
 await page.waitForTimeout(100);assert.equal(await frame.locator('body').getAttribute('data-ff-theme'),'dark');
 if(process.env.FORM_FILL_SCREENSHOTS)await page.screenshot({path:process.env.FORM_FILL_SCREENSHOTS+'/wizard-dark.png'});
 await page.evaluate(()=>document.documentElement.removeAttribute('data-ds-dark-theme'));
 await frame.getByRole('button',{name:'4 确认描述',exact:true}).click();
 if(await frame.locator('#scope-ack-label').isVisible())await frame.locator('#scope-ack').check();
 await frame.locator('#requirements').fill('只补工商字段');
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await frame.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'原生输入框'}).inputValue(),'保留我的手写要求');
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await frame.getByRole('button',{name:'追加',exact:true}).click();
 await page.waitForFunction(()=>probe.draft.includes('form_fill_enrich'));
 assert.ok((await page.evaluate(()=>probe.draft)).startsWith('保留我的手写要求\n\n'));
 await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await frame.locator('#wizard').waitFor({state:'hidden'});
 assert.equal((await page.evaluate(()=>probe.draft)).match(/form_fill_enrich/g).length,1);
 assert.ok((await page.evaluate(()=>probe.draft)).startsWith('保留我的手写要求\n\n'));
 await page.getByRole('textbox',{name:'原生输入框'}).fill('可以替换的内容');
 await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await frame.getByRole('button',{name:'替换',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('textarea').value.includes('可以替换的内容'));
 assert.match(await page.evaluate(()=>probe.draft),/expectedRevision=1/);
 assert.equal(await page.evaluate(()=>probe.active),id);
 await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
 await page.getByRole('button',{name:'填写预览',exact:true}).click();
 await frame.locator('#changes tr').nth(5).waitFor();
 await frame.locator('#result-search').fill('无匹配合成条件');
 assert.equal(await frame.locator('#changes tr:visible').count(),0);
 assert.ok((await frame.locator('#result-count').innerText()).includes('已选 6 格'));
 await frame.locator('#result-search').fill('');
 for(const size of [{width:1440,height:900},{width:390,height:700}]){
  await page.setViewportSize(size);
  await page.waitForTimeout(100);
  const panel=await page.getByRole('region',{name:'AI填表工作台'}).boundingBox();
  assert.ok(panel.x>=-1&&panel.x+panel.width<=size.width+1);
  if(process.env.FORM_FILL_SCREENSHOTS)await page.screenshot({path:process.env.FORM_FILL_SCREENSHOTS+'/workbench-'+size.width+'.png'});
  await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
  await page.getByRole('button',{name:'提示词生成',exact:true}).click();
  await frame.locator('#wizard').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.ff-panel').getBoundingClientRect().width===innerWidth);
  const dialog=await frame.locator('#wizard').boundingBox();assert.ok(dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=size.width+1&&dialog.y+dialog.height<=size.height+1);
  await frame.getByRole('button',{name:'关闭提示词向导',exact:true}).click();
 }
 await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
 await page.getByRole('button',{name:'新会话',exact:true}).click();
 await page.waitForFunction(()=>probe.active.startsWith('normal-'));
 assert.equal(await page.getByRole('button',{name:'导入表格',exact:true}).count(),0);
 assert.equal(await page.locator('.ff-hero').count(),0);assert.equal(await page.locator('.headlineText').isVisible(),true);
 await page.getByRole('button',{name:'新会话',exact:true}).click();
 assert.equal(await page.evaluate(()=>probe.normalStarts),1);assert.deepEqual(errors,[]);
 console.log('Native React contract: owned session, navigation, draft, task restore, responsive panel, normal NewSession PASS; not a real Host/model E2E');
}finally{await browser.close();service.dispose();await new Promise(ok=>server.close(ok))}
