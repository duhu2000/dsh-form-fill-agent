import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
import {fixtureBytes} from './generate-fixtures.mjs';
const server=createServer(),service=createFormFillHandler({getPort:()=>server.address().port});
server.on('request',(req,res)=>{
 if(req.url.startsWith('/embed')){res.setHeader('Content-Type','text/html');res.end(`<iframe style="width:100%;height:900px" src="/${new URL(req.url,'http://local').searchParams.get('task')? '#task='+new URL(req.url,'http://local').searchParams.get('task'):''}"></iframe><script>window.drafts=[];addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data.type==='ff-capabilities'&&!location.search.includes('old=1'))e.source.postMessage({type:'ff-capabilities-result',mappingDraft:2},location.origin);if(e.data.type==='ff-draft')drafts.push(e.data)})</script>`);return}service.handler(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));assert.notEqual(server.address().port,43120);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
const origin='http://127.0.0.1:'+server.address().port;
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 const bytes=fixtureBytes('映射验收',['企业名称','法定代表人','法人','地址','未知口径'],[['合成客户甲有限公司','','','','']],{title:false});
 await page.locator('#file').setInputFiles({name:'合成.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.locator('.ff-mapping-row').first().waitFor();
 const row=name=>page.locator('.ff-mapping-row').filter({has:page.getByLabel('映射验收 字段 '+name,{exact:true})});
 for(const theme of ['light','dark'])for(const width of [320,390,640,1024,1440]){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});
  assert.match(await row('企业名称').innerText(),/自动通过/);
  for(const name of ['法定代表人','法人','地址'])assert.match(await row(name).innerText(),/待人工确认/);
  assert.match(await row('未知口径').innerText(),/未匹配/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.notEqual(await row('企业名称').locator('.ff-mapping-status').evaluate(e=>getComputedStyle(e).color),await row('地址').locator('.ff-mapping-status').evaluate(e=>getComputedStyle(e).color));
  await row('地址').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/ff-mapping-states-'+theme+'-'+width+'.png'});
 }
 for(const name of ['法定代表人','法人']){await row(name).locator('summary').click();await row(name).locator('select[data-column]').focus();await page.keyboard.press('Enter')}
 await row('地址').getByRole('button',{name:'推荐：注册地址',exact:true}).click();
 await row('未知口径').locator('summary').click();await row('未知口径').getByRole('button',{name:'确认选择',exact:true}).click();
 await page.locator('#configure').click();await page.waitForFunction(()=>document.querySelector('[data-step=identity]').getAttribute('aria-current')==='true');
 const taskId=new URL(page.url()).hash.slice(6);
 await page.reload();await page.getByRole('button',{name:'字段设置',exact:true}).click();
 assert.match(await row('企业名称').innerText(),/自动通过/);
 for(const name of ['法定代表人','法人','地址'])assert.match(await row(name).innerText(),/已确认/);
 assert.match(await row('未知口径').innerText(),/已跳过/);
 await page.getByRole('button',{name:'主体核验',exact:true}).click();
 await page.locator('#direct-ack').check();await page.locator('#wizard-open').click();
 assert.match(await page.locator('#direct-command').inputValue(),/form_fill_enrich/);
 // Removing one mapping cannot erase the other position sharing its field.
 await page.getByRole('button',{name:'字段设置',exact:true}).click();await row('法人').locator('summary').click();await row('法人').locator('select[data-column]').selectOption('');
 await page.locator('#configure').click();await page.waitForFunction(()=>document.querySelector('[data-step=identity]').getAttribute('aria-current')==='true');
 assert.match(await row('法人').innerText(),/已跳过/);
 const saved=await page.evaluate(async()=>{const id=location.hash.slice(6);return (await fetch('/task/'+id)).json()});
 assert.equal(saved.configuration.mappings.find(m=>m.column===2).field,'legal_person');
 assert.equal(saved.configuration.mappings.find(m=>m.column===3).field,null);
 // Old Host must receive no draft; new Host receives the same task/revision.
 for(const old of [true,false]){
  await page.goto(origin+'/embed?task='+taskId+(old?'&old=1':''));const frame=page.frameLocator('iframe');
  await frame.getByRole('button',{name:'主体核验',exact:true}).click();await frame.locator('#direct-ack').check();await frame.locator('#wizard-open').click();
  if(old){await frame.locator('#status').filter({hasText:'当前 Host 不支持'}).waitFor();assert.equal(await page.evaluate(()=>drafts.length),0)}
  else{await page.waitForFunction(()=>drafts.length===1);assert.equal(await page.evaluate(()=>drafts[0].taskId),taskId)}
 }
 assert.deepEqual(errors,[]);console.log('PASS: mapping states light/dark × 5 widths; duplicate confirmation; skip; reload; scope removal; old/new Host draft handshake');
}finally{await browser.close();service.dispose();await new Promise(r=>server.close(r))}
