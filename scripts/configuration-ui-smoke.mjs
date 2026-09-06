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
 const bytes=fixtureBytes('配置表',['单位','负责人'],[['合成客户甲有限公司','']],{title:false});
 await page.locator('#file').setInputFiles({name:'合成映射.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await page.getByRole('button',{name:'分析表格',exact:true}).click();
 await page.getByLabel('配置表 字段 单位',{exact:true}).selectOption('company_name');
 await page.getByLabel('配置表 字段 负责人',{exact:true}).selectOption('legal_person');
 await page.getByRole('button',{name:'应用字段设置',exact:true}).click();
 await page.getByText('字段设置已应用，旧预览已清除，请重新核验。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('配置表 字段 负责人',{exact:true}).inputValue(),'legal_person');
 await page.reload();await page.getByRole('button',{name:'2 字段与规则',exact:true}).click();
 assert.equal(await page.getByLabel('配置表 字段 单位',{exact:true}).inputValue(),'company_name');
 // Seed synthetic Provider responses through the same HTTP service; choices remain native UI.
 const candidateBytes=fixtureBytes('候选表',['企业名称','法定代表人'],[['合成待选主体有限公司','']],{title:false});
 const created=await page.evaluate(async base64=>{
  const response=await fetch('/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64,filename:'合成候选.xlsx'})});return response.json();
 },candidateBytes.toString('base64'));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#task='+created.id);
 await page.getByRole('button',{name:'3 主体核验',exact:true}).click();
 const select=page.getByLabel('候选 候选表 2',{exact:true});await select.waitFor();
 assert.equal(await select.inputValue(),'');
 await select.selectOption({index:2});
 await page.getByRole('button',{name:'确认此主体',exact:true}).click();
 await page.getByText('主体已确认，请重新发送查询指令。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'4 填写预览',exact:true}).click();
 assert.ok((await page.locator('#changes').innerText()).includes('合成人员乙'));
 for(const viewport of [{width:390,height:700},{width:1024,height:768}]){await page.setViewportSize(viewport);await page.getByRole('button',{name:'2 字段与规则',exact:true}).click();await page.getByRole('button',{name:'应用字段设置',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.getByRole('button',{name:'应用字段设置',exact:true}).isVisible())}
 console.log('Configuration UI: mapping, reload, unselected candidates, explicit second choice, preview, narrow layouts PASS');
}finally{await browser?.close();service.dispose();await new Promise(ok=>server.close(ok))}
