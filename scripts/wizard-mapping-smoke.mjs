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
 const bytes=fixtureBytes('合成表',['企业名称','地址','法定代表人','企业状态','CreditCode','核准日期 YYYY-MM-DD'],Array.from({length:60},(_,i)=>['合成企业'+i+'有限公司','','','','','']),{title:false});
 await page.locator('#wizard-file').setInputFiles({name:'合成向导.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.locator('#wizard-source').filter({hasText:'合成向导.xlsx'}).waitFor();
 await page.locator('#wizard-next').click();
 await page.locator('[data-wizard-step="3"]').click();
 assert.equal(await page.locator('[data-wizard-step="1"]').getAttribute('aria-current'),'true','unapplied mapping must not bypass confirmation');
 const address=page.locator('#wizard-mapping .ff-mapping-row').filter({has:page.getByLabel('合成表 字段 地址',{exact:true})});
 await address.waitFor({state:'visible'});
 assert.match(await address.textContent(),/待人工确认/);
 await address.getByRole('button',{name:/推荐.*注册地址/}).click();
 assert.match(await address.textContent(),/已确认/);
 for(const [source,target] of [['企业状态','经营状态'],['CreditCode','统一社会信用代码'],['核准日期 YYYY-MM-DD','核准日期']]){
  const row=page.locator('#wizard-mapping .ff-mapping-row').filter({has:page.getByLabel('合成表 字段 '+source,{exact:true})});
  assert.match(await row.textContent(),/待人工确认/);
  assert.equal(await row.locator('select[data-column]').inputValue(),'','recommendation must not silently select a field');
  await row.getByRole('button',{name:'推荐：'+target,exact:true}).click();
  assert.match(await row.textContent(),/已确认/);
  if(source==='CreditCode')await row.locator('.ff-mapping-role').selectOption('output');
 }
 await page.locator('#wizard-next').click();
 await page.waitForFunction(()=>document.querySelector('[data-wizard-step="2"]').getAttribute('aria-current')==='true');
 assert.equal(await page.locator('#wizard').isVisible(),true);
 assert.match(await page.locator('#field-count').textContent(),/5/);
 await page.locator('#wizard-next').click();
 assert.ok((await page.locator('#business-summary').textContent()).length<400);
 assert.match(await page.locator('#business-summary').textContent(),/300 个待补空位置/);
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
 await page.evaluate(()=>{render({...current,changeSet:{...current.changeSet,incomplete:[]}});downloads();navigate('preview')});
 assert.equal(await page.locator('#incomplete').isVisible(),false);
 assert.equal(await page.locator('#downloads a').filter({hasText:'下载未完成项'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS inline wizard mapping, automatic scope, bounded summary, restoration, light/dark narrow layouts');
}finally{await browser?.close();server.close();await service.close?.()}
