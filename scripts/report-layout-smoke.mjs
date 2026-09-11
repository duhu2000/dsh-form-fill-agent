import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createDemoServer} from '../apps/demo/server.mjs';import {fixtureBytes} from './generate-fixtures.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));const server=createDemoServer({maxTasks:20});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
try{for(const theme of ['light','dark'])for(const width of [390,800,1440]){
 const page=await browser.newPage({viewport:{width,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const bytes=fixtureBytes('布局',['企业名称',...Array.from({length:18},(_,i)=>'原列'+i)],Array.from({length:60},(_,i)=>['合成企业'+i,...Array(18).fill('完整长文本'.repeat(18))]),{title:false});
 await page.locator('#file').setInputFiles({name:'布局.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await page.locator('#grid-body tr').first().waitFor();await page.locator('body').evaluate((e,t)=>e.dataset.ffTheme=t,theme);
 const result=await page.locator('#grid .scroll').evaluate(e=>{const th=e.querySelector('th'),td=e.querySelector('td'),top=th.getBoundingClientRect().top,left=td.getBoundingClientRect().left;e.scrollTop=200;e.scrollLeft=200;return {x:e.scrollWidth>e.clientWidth,y:e.scrollHeight>e.clientHeight,top:Math.abs(th.getBoundingClientRect().top-top)<2,left:Math.abs(td.getBoundingClientRect().left-left)<2,nowrap:getComputedStyle(td).whiteSpace}});
 assert.deepEqual(result,{x:true,y:true,top:true,left:true,nowrap:'nowrap'});assert.deepEqual(errors,[]);console.log(theme,width,'scroll and sticky PASS');
 await page.getByRole('button',{name:'导入表格',exact:true}).click();await page.locator('details:has(#samples)').evaluate(e=>e.open=true);await page.getByRole('button',{name:'客户台账',exact:true}).click();await page.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();await page.getByRole('button',{name:'确认下载',exact:true}).click();assert.equal(await page.locator('#report-download').isVisible(),false);await page.locator('#confirm').click();await page.locator('#report-download').waitFor();
 assert.equal(await page.locator('#downloads a').count(),1);assert.equal(await page.getByRole('button',{name:'预览任务结果报告',exact:true}).count(),0);assert.equal(await page.locator('#report-download').evaluate(e=>e.closest('#downloads')),null);
 const report=await page.request.get(new URL(await page.locator('#report-download').getAttribute('href'),page.url()).href);assert.equal(report.status(),200);
 await page.locator('#report-download').focus();assert.equal(await page.locator('#report-download').evaluate(e=>e===document.activeElement),true);
 const rect=await page.locator('#report-download').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width);await page.reload();await page.locator('#report-download').waitFor();assert.match(await page.locator('#download-summary').textContent(),/已确认填写 6 格/);
 assert.deepEqual(errors,[]);console.log(theme,width,'secondary report, download and restore PASS');await page.close();
}}finally{await browser.close();await new Promise(ok=>server.close(ok))}
