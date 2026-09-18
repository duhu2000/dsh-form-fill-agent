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
 const bytes=fixtureBytes('映射验收',['企业名称','法定代表人','法人','地址','未知口径','省份','企业规模','企查查行业一级'],[['合成客户甲有限公司','','','','','','','']],{title:false});
 await page.locator('#file').setInputFiles({name:'合成.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.locator('.ff-mapping-row').first().waitFor();
 const row=name=>page.locator('.ff-mapping-row').filter({has:page.getByLabel('映射验收 字段 '+name,{exact:true})});
 for(const theme of ['light','dark'])for(const width of [320,390,640,1024,1440]){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});
  assert.match(await row('企业名称').innerText(),/自动通过/);
  for(const field of ['省份','企业规模','企查查行业一级'])assert.match(await row(field).innerText(),/自动通过/);
  assert.match(await row('企业规模').innerText(),/企业规模与人员规模独立/);
  for(const name of ['法定代表人','法人'])assert.match(await row(name).innerText(),/自动通过/);
  assert.match(await row('地址').innerText(),/待人工确认/);
  assert.match(await row('未知口径').innerText(),/未匹配/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.notEqual(await row('企业名称').locator('.ff-mapping-status').evaluate(e=>getComputedStyle(e).color),await row('地址').locator('.ff-mapping-status').evaluate(e=>getComputedStyle(e).color));
  await row('地址').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/ff-mapping-states-'+theme+'-'+width+'.png'});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS new fields: light/dark × 5 widths, mapping states, scale descriptions');
}finally{await browser.close();await new Promise(r=>server.close(r))}
