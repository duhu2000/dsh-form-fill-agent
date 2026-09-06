import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
import {fixtureBytes} from './generate-fixtures.mjs';
const server=createServer();let browser;
const service=createFormFillHandler({getPort:()=>server.address()?.port});
server.on('request',service.handler);server.listen(0,'127.0.0.1');await once(server,'listening');
assert.notEqual(server.address().port,43120);
try{
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const colorScheme of ['light','dark'])for(const width of [320,390,480,640,900]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:900});
  const menu=page.getByRole('navigation',{name:'工作流程',exact:true});
  assert.deepEqual(await menu.locator('.ff-stage-label').allTextContents(),['导入表格','字段设置','主体核验','填写预览','确认下载']);
  assert.equal(await menu.locator('svg[aria-hidden=true]').count(),5);
  const geometry=await menu.evaluate(nav=>{const r=nav.getBoundingClientRect();return {width:r.width,scroll:nav.scrollWidth,client:nav.clientWidth,right:r.right,viewport:innerWidth,items:[...nav.children].map(b=>{const r=b.getBoundingClientRect(),i=b.querySelector('svg').getBoundingClientRect(),l=b.querySelector('.ff-stage-label').getBoundingClientRect();return {width:r.width,top:r.top,iconBottom:i.bottom,labelTop:l.top}})}});
  assert.ok(geometry.scroll<=geometry.client+1,'stage navigation must not scroll horizontally');
  assert.ok(geometry.right<=geometry.viewport,'stage navigation remains within viewport');
  for(const item of geometry.items){assert.ok(Math.abs(item.width-geometry.width/5)<1);assert.ok(Math.abs(item.top-geometry.items[0].top)<1);assert.ok(item.iconBottom<=item.labelTop)}
  if(width===390||width===640)await page.screenshot({path:'/tmp/form-fill-stages-'+colorScheme+'-'+width+'.png'});
 }
 await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1440,height:900});
 const bytes=fixtureBytes('配置表',['单位','负责人'],[['合成客户甲有限公司','']],{title:false});
 await page.locator('#file').setInputFiles({name:'合成映射.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.getByRole('button',{name:'分析表格',exact:true}).click();
 await page.getByLabel('配置表 字段 单位',{exact:true}).selectOption('company_name');
 await page.getByLabel('配置表 字段 负责人',{exact:true}).selectOption('legal_person');
 await page.getByRole('button',{name:'应用字段设置',exact:true}).click();
 await page.getByText('字段设置已应用，旧预览已清除，请重新核验。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('配置表 字段 负责人',{exact:true}).inputValue(),'legal_person');
 await page.reload();await page.getByRole('button',{name:'字段设置',exact:true}).click();
 assert.equal(await page.getByLabel('配置表 字段 单位',{exact:true}).inputValue(),'company_name');
 await page.getByRole('button',{name:'保存字段规则',exact:true}).click();
 await page.getByText('字段规则已保存在本浏览器。',{exact:true}).waitFor();
 await page.getByLabel('配置表 字段 负责人',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'复用字段规则',exact:true}).click();
 await page.getByText('字段规则已复用，请检查后重新核验。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('配置表 字段 负责人',{exact:true}).inputValue(),'legal_person');
 // Seed synthetic Provider responses through the same HTTP service; choices remain native UI.
 const candidateBytes=fixtureBytes('候选表',['企业名称','法定代表人'],[['合成待选主体有限公司','']],{title:false});
 const created=await page.evaluate(async base64=>{
  const response=await fetch('/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64,filename:'合成候选.xlsx'})});return response.json();
 },candidateBytes.toString('base64'));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#task='+created.id);
 await page.getByRole('button',{name:'主体核验',exact:true}).click();
 const select=page.getByLabel('候选 候选表 2',{exact:true});await select.waitFor();
 assert.equal(await select.inputValue(),'');
 await select.selectOption({index:2});
 await page.getByRole('button',{name:'确认此主体',exact:true}).click();
 await page.getByText('主体已确认，请重新发送查询指令。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'填写预览',exact:true}).click();
 assert.ok((await page.locator('#changes').innerText()).includes('合成人员乙'));
 const check=page.locator('#changes input[type=checkbox]').first();await check.uncheck();await page.locator('#selection').click();
 await page.getByText('选择已应用，请核对新的预览。',{exact:true}).waitFor();assert.equal(await check.isChecked(),false);
 await page.reload();await page.getByRole('button',{name:'填写预览',exact:true}).click();assert.equal(await check.isChecked(),false);
 await check.check();await page.locator('#selection').click();await page.getByText('选择已应用，请核对新的预览。',{exact:true}).waitFor();
 await page.locator('#grid summary').click();await page.locator('#grid-body tr').first().waitFor();
 await page.locator('#grid-view').selectOption('result');await page.locator('#grid-body .grid-changed').first().waitFor();
 await page.locator('#grid-query').fill('合成人员乙');await page.locator('#grid-search').click();
 await page.waitForFunction(()=>document.querySelectorAll('#grid-body tr').length===1);
 for(const colorScheme of ['light','dark'])for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:700},{width:900,height:500}]){await page.emulateMedia({colorScheme});await page.setViewportSize(viewport);await page.getByRole('button',{name:'字段设置',exact:true}).click();await page.getByRole('button',{name:'应用字段设置',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.getByRole('button',{name:'应用字段设置',exact:true}).isVisible())}
 await page.setViewportSize({width:1440,height:900});
 const controlled=await page.evaluate(async base64=>(await fetch('/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64,analyzeOnly:true})})).json(),fixtureBytes('取消演示',['企业名称','法定代表人'],[['合成取消有限公司','']],{title:false}).toString('base64'));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#task='+controlled.id);
 const {createQccProvider}=await import('qcc-form-fill-provider');
 let entered;const started=new Promise(ok=>entered=ok);
 const run=service.enrich(controlled.id,createQccProvider({callTool:async(_a,_b,{signal})=>{entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))}}),controlled.revision);
 await started;await page.reload();await page.locator('#cancel-run').click();await run;
 await page.waitForFunction(()=>!document.querySelector('#retry-run').disabled);
 await page.locator('#retry-run').click();await page.getByText('仅重试失败、取消或未执行的部分，保留成功结果。',{exact:false}).first().waitFor();
 assert.match(await page.locator('#qcc-command').textContent(),/mode=retry/);
 await page.keyboard.press('Escape');await page.locator('#wizard').waitFor({state:'hidden'});
 console.log('Configuration UI: cancellation and retry instruction, restored selection, full grid/search, mapping reuse, mapping, reload, unselected candidates, explicit second choice, preview, narrow layouts PASS');
}finally{await browser?.close();service.dispose();await new Promise(ok=>server.close(ok))}
