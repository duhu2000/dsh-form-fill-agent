import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createFormFillHandler} from '../packages/dsh-form-fill-agent/lib/http.js';
import {fixtureBytes} from './generate-fixtures.mjs';
import {ACTUAL_CONTROLLER_GROUP} from 'qcc-field-contracts';
const server=createServer(),service=createFormFillHandler({getPort:()=>server.address()?.port});
server.on('request',service.handler);server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try {
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const alias='企业实控人名称（自然人请填写姓名）';
 await page.locator('#file').setInputFiles({name:'合成实控人.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer:fixtureBytes('实控人',['企业名称',alias],[['合成测试有限公司','']],{title:false})});
 await page.getByRole('button',{name:'分析表格',exact:true}).click();
 await page.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
 const select=page.getByLabel('实控人 字段 '+alias,{exact:true});
 assert.equal(await select.inputValue(),'actual_controller_name');
 const row=page.locator('.ff-mapping-row').filter({has:select});
 await row.locator('summary').click();
 assert.equal(await select.locator('optgroup[label="实际控制人"] option').count(),4);
 for(const field of ACTUAL_CONTROLLER_GROUP.fields)assert.equal(await select.locator('option[value="'+field.id+'"]').count(),1);
 for(const colorScheme of ['light','dark'])for(const width of [1440,390]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:900});
  assert.ok(await select.isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);
 console.log('Controller UI: automatic long-header alias, 4 grouped choices, light/dark desktop/narrow PASS');
} finally {await browser?.close();service.dispose();server.close();server.closeAllConnections();}

