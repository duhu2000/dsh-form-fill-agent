// Real DSH model -> QCC -> workbench. Runtime credentials/company arrive on stdin.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {fixtureBytes} from './generate-fixtures.mjs';
import {parseWorkbook} from 'form-fill-core';
import {previewBytes} from 'dsh-form-fill-agent';
const [homeArg,binArg,portArg]=process.argv.slice(2),home=resolve(homeArg),bin=resolve(binArg),port=Number(portArg);
assert.ok(basename(home).startsWith('form-fill-native-'));assert.ok(port>1024&&port<65536&&port!==43120);
assert.equal(JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8')).name,'synthetic-native-test');
const input=createInterface({input:process.stdin,terminal:false});
const [line]=await once(input,'line');input.close();process.stdin.pause();
const {authorization,company}=JSON.parse(line);
assert.match(authorization,/^Bearer [A-Za-z0-9._~+\/-]+=*$/);assert.ok(typeof company==='string'&&company.length>3);
const origin='http://127.0.0.1:'+port;
const version=execFileSync(process.execPath,[bin,'--version'],{encoding:'utf8'}).trim();
const child=spawn(process.execPath,[bin,'--profile','web','--port',String(port),'--no-open'],{
 cwd:join(home,'synthetic-workspace'),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,DSH_HOME:home,NO_COLOR:'1',QCC_MCP_TOKEN:authorization.slice(7)},stdio:['ignore','pipe','pipe']
});
let startup='',browser,phase='startup';
const collect=b=>{startup=(startup+b.toString()).slice(-65536)};child.stdout.on('data',collect);child.stderr.on('data',collect);
process.once('SIGINT',()=>child.kill('SIGTERM'));process.once('SIGTERM',()=>child.kill('SIGTERM'));
try{
 let health,entry;
 for(let i=0;i<150;i++){
  try{health=await (await fetch(origin+'/form-fill/health')).json()}catch{}
  entry=(startup.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\x1b]*/g)||[]).find(raw=>new URL(raw).port===String(port)&&new URL(raw).searchParams.has('token'));
  if(health?.qccAvailable&&(entry||version.includes('rc.2')))break;
  await new Promise(ok=>setTimeout(ok,300));
 }
 assert.ok(health?.qccAvailable,'QCC registration tool available');
 if(version.includes('rc.2'))entry??=origin;
 assert.ok(entry,'Host authenticated launch entry available in memory');
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(20000);
 await page.addLocatorHandler(page.getByRole('button',{name:'继续',exact:true}),async locator=>locator.click());
 await page.goto(entry);startup='';entry=undefined;
 child.stdout.off('data',collect);child.stderr.off('data',collect);child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
 const prepared=await page.evaluate(async ({path,alpha})=>{
  const method=alpha?'workspace/create':'workspace.create',payload=alpha?{args:{request:{path}}}:{path};
  const response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload})});
  return (await response.json()).result?.ok;
 },{path:join(home,'synthetic-workspace'),alpha:version.includes('alpha')});
 assert.equal(prepared,true,'prepare real Host workspace');await page.reload();
 phase='upload';
 await page.getByRole('link',{name:'AI填表',exact:true}).waitFor();
 const previousSession=await page.locator('[data-form-fill-session]').count()?await page.locator('[data-form-fill-session]').first().getAttribute('data-form-fill-session'):null;
  await page.getByRole('link',{name:'AI填表',exact:true}).click();
  await page.waitForFunction(previous=>{const id=document.querySelector('[data-form-fill-session]')?.getAttribute('data-form-fill-session');return id&&id!==previous},previousSession);
 await page.getByRole('button',{name:'导入表格',exact:true}).click();
 const frame=page.frameLocator('iframe[title="AI填表任务"]');
 const extended=process.env.FORM_FILL_LIVE_EXTENDED==='1',expectedCount=extended?4:6;
 const headers=extended?['企业名称','企查查行业','企业简介','开票地址','开户行']:['企业名称','信用代码','法定代表人','成立日期','注册地址','登记状态','登记机关'];
 const bytes=fixtureBytes('工商验证',headers,[[company,...Array(expectedCount).fill('')]]);
 await frame.locator('#file').setInputFiles({name:'工商验证.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
 await frame.getByRole('button',{name:'分析表格',exact:true}).click();
 await frame.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
  assert.equal(await frame.locator('#changes tr').count(),0);
  const taskId=await frame.locator('#status').evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('task'));
 console.log(JSON.stringify({phase:'local-analysis',changes:0,realQueries:0}));
 await frame.getByRole('button',{name:'3 主体核验',exact:true}).click();
 await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
 await frame.getByRole('button',{name:'4 确认描述',exact:true}).click();
 await frame.locator('#requirements').fill('请现在仅调用 form_fill_enrich 完成本任务。不要通过其他工具读取文件或另行查询，完成后等我确认副本。');
 await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('textarea,[contenteditable=true]')].some(e=>(e.value||e.textContent).includes('form_fill_enrich')));
 await frame.getByRole('button',{name:'4 填写预览',exact:true}).click();
 phase='model';
 const submitted=[];
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(/prompt|submit|enqueue/.test(path))submitted.push({path,status:response.status()})});
 await page.getByRole('button',{name:'发送消息',exact:true}).click();
 console.log(JSON.stringify({phase:'native-message-sent',taskIdIncluded:true,companyInPrompt:false}));
 let preview;
 for(let i=0;i<90;i++){
  const response=await page.request.get(origin+'/form-fill/task/'+taskId);
  if(response.ok())preview=await response.json();
  if(preview?.revision>1&&preview.state!=='enriching')break;
  if(i%10===0){
   const labels=await page.getByRole('button').allTextContents();
   console.log(JSON.stringify({phase:'waiting-model',seconds:i*2,state:preview?.state,revision:preview?.revision,submitted,approvalButtons:labels.filter(s=>/^(允许|批准|同意|Allow|Approve)/.test(s.trim())).map(s=>s.trim().slice(0,30))}));
  }
  await new Promise(ok=>setTimeout(ok,2000));
 }
 assert.ok(preview?.revision>1,'model must invoke form_fill_enrich');
 assert.equal(preview.changeSet.changes.length,expectedCount,'real selected fields');
 assert.ok(preview.changeSet.changes.every(c=>c.source.startsWith('qcc://')));
 phase='preview';
 await frame.locator('#changes tr').nth(expectedCount-1).waitFor();
 assert.equal(await frame.locator('#changes tr').count(),expectedCount);
 await frame.getByRole('button',{name:'5 确认与下载',exact:true}).click();
 await frame.getByRole('button',{name:'确认这些填写，生成新副本',exact:true}).click();
 const link=frame.getByRole('link',{name:'下载已填副本',exact:true});await link.waitFor();
 const download=await page.request.get(origin+await link.getAttribute('href'));assert.equal(download.status(),200);
 const output=await download.body();assert.ok(parseWorkbook(output).sheets.length);
 assert.equal((await previewBytes(output)).changeSet.changes.length,0);
 console.log(JSON.stringify({kind:'real-dsh-model-qcc-e2e',version,result:'PASS',extended,filled:expectedCount,secondPassChanges:0,nativeSend:true,mockProviderUsedForFacts:false,realDataWrittenToRepository:false}));
}catch(error){
 if(browser){
  const page=browser.contexts()[0]?.pages()[0];
  if(page){const text=await page.locator('body').innerText();console.log(JSON.stringify({diagnostics:{missingModelKey:/添加一个 API Key|API key.*(?:invalid|missing)|未配置.*Key/i.test(text),authenticationError:/401|Unauthorized|authentication failed/i.test(text),permissionPrompt:/需要.*批准|等待.*确认|允许本次/.test(text)}}))}
 }
 throw Error('Live DSH E2E failed ('+phase+'): '+String(error.message).split('\n')[0]);
}finally{
 await browser?.close();child.kill('SIGTERM');
 if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(ok=>setTimeout(ok,3000))]);
 if(child.exitCode===null)child.kill('SIGKILL');
}
