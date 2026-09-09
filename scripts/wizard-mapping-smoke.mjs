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
 const bytes=fixtureBytes('合成表',['企业名称','地址','法定代表人'],Array.from({length:60},(_,i)=>['合成企业'+i+'有限公司','','']),{title:false});
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
 await page.locator('#wizard-next').click();
 await page.waitForFunction(()=>document.querySelector('[data-wizard-step="2"]').getAttribute('aria-current')==='true');
 assert.equal(await page.locator('#wizard').isVisible(),true);
 assert.match(await page.locator('#field-count').textContent(),/2/);
 await page.locator('#wizard-next').click();
 assert.ok((await page.locator('#business-summary').textContent()).length<400);
 assert.match(await page.locator('#business-summary').textContent(),/120 个待补空位置/);
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
 assert.deepEqual(errors,[]);console.log('PASS inline wizard mapping, automatic scope, bounded summary, restoration, light/dark narrow layouts');
}finally{await browser?.close();server.close();await service.close?.()}
