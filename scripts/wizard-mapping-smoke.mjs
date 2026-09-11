import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
import {fixtureBytes} from './generate-fixtures.mjs';
const server=createServer();let browser;
const service=createFormFillHandler({getPort:()=>server.address()?.port});
server.on('request',service.handler);server.listen(0,'127.0.0.1');await once(server,'listening');
try{
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>window.postMessage({type:'ff-navigate',step:'wizard'},location.origin));
 await page.locator('#wizard').waitFor({state:'visible'});
 const bytes=fixtureBytes('合成表',['企业名称','地址','法定代表人','企业状态','CreditCode','核准日期 YYYY-MM-DD','受益人','主营业务收入','注册资本（重复列 2）','注册资本'],Array.from({length:60},(_,i)=>['合成企业'+i+'有限公司','','','','','','','','','']),{title:false});
 await page.locator('#wizard-file').setInputFiles({name:'合成向导.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.locator('#wizard-source').filter({hasText:'合成向导.xlsx'}).waitFor();
 await page.locator('#wizard-next').click();
 await page.locator('[data-wizard-step="3"]').click();
 assert.equal(await page.locator('[data-wizard-step="1"]').getAttribute('aria-current'),'true','unapplied mapping must not bypass confirmation');
 const address=page.locator('#wizard-mapping .ff-mapping-row').filter({has:page.getByLabel('合成表 字段 地址',{exact:true})});
 await address.waitFor({state:'visible'});
 await page.locator('#wizard-grid #grid-body tr').first().waitFor();
 assert.ok(await page.locator('#wizard-grid #grid-body tr').count()>1,'wizard includes full workbook preview, not only headers');
 assert.match(await address.textContent(),/待人工确认/);
 await address.getByRole('button',{name:/推荐.*注册地址/}).click();
 assert.match(await address.textContent(),/已确认/);
 for(const [source,target] of [['企业状态','经营状态'],['CreditCode','统一社会信用代码'],['核准日期 YYYY-MM-DD','核准日期'],['受益人','受益所有人名称（首条）'],['主营业务收入','营业总收入'],['注册资本（重复列 2）','注册资本']]){
  const row=page.locator('#wizard-mapping .ff-mapping-row').filter({has:page.getByLabel('合成表 字段 '+source,{exact:true})});
  assert.match(await row.textContent(),/待人工确认/);
  if(source==='主营业务收入')assert.match(await row.textContent(),/口径不同/);
  if(source==='受益人')assert.match(await row.textContent(),/不代表唯一/);
  assert.equal(await row.locator('select[data-column]').inputValue(),'','recommendation must not silently select a field');
  await row.getByRole('button',{name:'推荐：'+target,exact:true}).click();
  assert.match(await row.textContent(),/已确认/);
  if(source==='CreditCode')await row.locator('.ff-mapping-role').selectOption('output');
 }
 await page.locator('#wizard-next').click();
 await page.waitForFunction(()=>document.querySelector('[data-wizard-step="2"]').getAttribute('aria-current')==='true');
 assert.equal(await page.locator('#wizard').isVisible(),true);
 assert.match(await page.locator('#field-count').textContent(),/8/);
 await page.locator('#wizard-next').click();
 assert.ok((await page.locator('#business-summary').textContent()).length<400);
 assert.match(await page.locator('#business-summary').textContent(),/540 个待补空位置/);
 assert.equal(await page.evaluate(()=>current.configuration.mappings.filter(m=>m.field==='reg_capital').length),2,'automatic and manually selected duplicate outputs both persist');
 for(const colorScheme of ['light','dark'])for(const width of [390,900]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:844});
  await page.locator('[data-wizard-step="1"]').click();
  const geometry=await page.locator('#wizard').evaluate(d=>({overflow:d.scrollWidth>d.clientWidth,right:d.getBoundingClientRect().right}));
  assert.equal(geometry.overflow,false);assert.ok(geometry.right<=width+1);
  await page.screenshot({path:'/tmp/ff-inline-mapping-'+colorScheme+'-'+width+'.png'});
 }
 await page.locator('#wizard-close').click();
 await page.locator('[data-step="rules"]').click();
 assert.equal(await page.locator('#mapping').count(),1);
 assert.equal(await page.getByLabel('合成表 字段 地址',{exact:true}).inputValue(),'registered_address');
 const active=await page.evaluate(()=>({id:current.id,revision:current.revision}));
 let releaseLookup;const gate=new Promise(resolve=>releaseLookup=resolve);
 const execution=service.enrich(active.id,{mode:'mock',version:'test',capabilities:[{id:'test',fields:['legal_person'],paid:false}],lookup:async()=>{await gate;return {status:'exact',values:{}}}},active.revision);
 try{
  await page.locator('#status').filter({hasText:/正在准备查询|已处理查询计划项/}).waitFor({timeout:10000});
  assert.equal(await page.locator('[data-step="identity"]').getAttribute('aria-current'),'true');
  assert.equal(await page.locator('#progress-panel').isVisible(),true);
  assert.equal(await page.locator('#task-progress').getAttribute('data-ended'),'false');
 }finally{releaseLookup();await execution}
 await page.locator('#status').filter({hasText:'查询已结束'}).waitFor({timeout:10000});
 assert.equal(await page.locator('[data-step="preview"]').getAttribute('aria-current'),'true');
 assert.equal(await page.locator('#task-progress').evaluate(p=>p.value),100);
 assert.equal(await page.locator('#task-progress').getAttribute('data-ended'),'true');
 for(const colorScheme of ['light','dark'])for(const width of [390,900]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/ff-progress-'+colorScheme+'-'+width+'.png'});
 }
 const taskTitle=await page.evaluate(()=>current.presentation.title);
 assert.match(taskTitle,/合成向导｜60 家企业/);
 await page.locator('#history-tab').click();
 await page.locator('#history-list button').filter({hasText:taskTitle}).waitFor();
 await page.locator('#current-tab').click();
 await page.locator('[data-step="rules"]').click();
 await page.reload();await page.locator('[data-step="rules"]').click();
 assert.equal(await page.getByLabel('合成表 字段 地址',{exact:true}).inputValue(),'registered_address');
 for(const [source,key] of [['企业状态','business_status'],['CreditCode','credit_no'],['核准日期 YYYY-MM-DD','approval_date']])assert.equal(await page.getByLabel('合成表 字段 '+source,{exact:true}).inputValue(),key,'confirmed recommendation survives reload in workbench');
 const searchRow=page.locator('.ff-mapping-row').filter({has:page.getByLabel('合成表 字段 地址',{exact:true})});
 await searchRow.locator('summary').click();
 await page.getByLabel('合成表 搜索目标字段 地址',{exact:true}).fill('CreditCode');
 assert.equal(await searchRow.locator('option[value="credit_no"]').count(),1,'recommendation alias is searchable');
 assert.equal(await page.getByLabel('合成表 字段 地址',{exact:true}).inputValue(),'registered_address','filter preserves selection outside search');
 await page.getByLabel('合成表 搜索目标字段 地址',{exact:true}).fill('不存在的维度关键词');
 assert.match(await searchRow.textContent(),/没有匹配字段/);
 assert.equal(await page.getByLabel('合成表 字段 地址',{exact:true}).inputValue(),'registered_address');
 // Synthetic UI state verifies empty review affordances without performing queries.
 await page.evaluate(()=>{render({...current,exceptions:[],changeSet:{...current.changeSet,incomplete:[]}});downloads();navigate('preview')});
 assert.equal(await page.locator('#incomplete').isVisible(),false);
 assert.equal(await page.locator('#downloads a').filter({hasText:'下载未完成项'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS inline wizard mapping, automatic scope, bounded summary, restoration, light/dark narrow layouts');
}finally{await browser?.close();server.close();await service.close?.()}
