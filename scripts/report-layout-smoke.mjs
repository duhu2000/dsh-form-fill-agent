import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createDemoServer} from '../apps/demo/server.mjs';import {fixtureBytes} from './generate-fixtures.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));const server=createDemoServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
try{for(const theme of ['light','dark'])for(const width of [390,800,1440]){
 const page=await browser.newPage({viewport:{width,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const bytes=fixtureBytes('布局',['企业名称',...Array.from({length:18},(_,i)=>'原列'+i)],Array.from({length:60},(_,i)=>['合成企业'+i,...Array(18).fill('完整长文本'.repeat(18))]),{title:false});
 await page.locator('#file').setInputFiles({name:'布局.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await page.locator('#grid-body tr').first().waitFor();await page.locator('body').evaluate((e,t)=>e.dataset.ffTheme=t,theme);
 const result=await page.locator('#grid .scroll').evaluate(e=>{const th=e.querySelector('th'),td=e.querySelector('td'),top=th.getBoundingClientRect().top,left=td.getBoundingClientRect().left;e.scrollTop=200;e.scrollLeft=200;return {x:e.scrollWidth>e.clientWidth,y:e.scrollHeight>e.clientHeight,top:Math.abs(th.getBoundingClientRect().top-top)<2,left:Math.abs(td.getBoundingClientRect().left-left)<2,nowrap:getComputedStyle(td).whiteSpace}});
 assert.deepEqual(result,{x:true,y:true,top:true,left:true,nowrap:'nowrap'});assert.deepEqual(errors,[]);console.log(theme,width,'scroll and sticky PASS');await page.close();
}}finally{await browser.close();await new Promise(ok=>server.close(ok))}
