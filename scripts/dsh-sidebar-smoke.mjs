import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
import {assessCompatibility} from '../packages/dsh-form-fill-agent/lib/preflight.js';
import {parseWorkbook} from 'form-fill-core';
import {fixtureBytes} from './generate-fixtures.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=process.cwd(),noSidebar=process.env.NO_SIDEBAR==='1';
const sidebarVersion=noSidebar?undefined:(process.env.SIDEBAR_VERSION||'0.17.1');
for(const entry of [process.env.DSH_RC_BIN,process.env.DSH_ALPHA_BIN].filter(Boolean)){
 assert.ok(entry);const bin=resolve(entry),home=await mkdtemp(join(tmpdir(),'form-fill-native-')),cwd=join(home,'synthetic-workspace'),profile=join(home,'profiles/web');
 await mkdir(cwd);await mkdir(profile,{recursive:true});
 const env={PATH:process.env.PATH,HOME:home,TMPDIR:tmpdir(),DSH_HOME:home,NO_COLOR:'1'};
 const version=execFileSync(process.execPath,[bin,'--version'],{env,cwd,encoding:'utf8'}).trim();
 const preflight=assessCompatibility({nodeVersion:process.version,hostVersion:version,sidebarVersion,contextVersion:process.env.CONTEXT_VERSION});
 assert.notEqual(preflight.status,'blocked',JSON.stringify(preflight));
 const dependencies=sidebarVersion?{'dsh-better-sidebar':sidebarVersion}:{};
 if(process.env.CONTEXT_VERSION)dependencies['dsh-context']=process.env.CONTEXT_VERSION;
 for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent']){
  const {version}=JSON.parse(await readFile(join(root,'packages',name,'package.json')));
  dependencies[name]='file:'+join(root,'artifacts',name+'-'+version+'.tgz');
 }
 await writeFile(join(profile,'package.json'),JSON.stringify({name:'synthetic-native-test',version:'0.0.0',private:true,type:'module',dependencies,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...(process.env.CONTEXT_VERSION?['dsh-context']:[]),...(sidebarVersion?['dsh-better-sidebar']:[]),'dsh-form-fill-agent']}}}));
 if(process.env.TOOL_PROBE==='1'){
  const probe=join(home,'tool-probe');await mkdir(probe);
  await writeFile(join(probe,'package.json'),JSON.stringify({name:'ff-synthetic-tool-probe',version:'0.0.0',type:'module',main:'index.js',dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
  await writeFile(join(probe,'index.js'),await readFile(join(root,'scripts/host-tool-probe.mjs')));
  await writeFile(join(probe,'cordis.patch.yml'),'- insert:\n    - id: ff-synthetic-tool-probe\n      name: ff-synthetic-tool-probe\n');
  const file=join(profile,'package.json'),manifest=JSON.parse(await readFile(file));manifest.dependencies['ff-synthetic-tool-probe']='file:'+probe;manifest.dsh.profile.bundles.push('ff-synthetic-tool-probe');await writeFile(file,JSON.stringify(manifest));
 }
 if(process.env.LEGACY_TARBALL){const file=join(profile,'package.json'),manifest=JSON.parse(await readFile(file));manifest.dependencies['dsh-data-cleaning-agent']='file:'+resolve(process.env.LEGACY_TARBALL);manifest.dsh.profile.bundles.push('dsh-data-cleaning-agent');await writeFile(file,JSON.stringify(manifest));}
 try{execFileSync('npm',['install','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:profile,stdio:'pipe'})}catch(error){await rm(join(profile,'node_modules'),{recursive:true,force:true});throw error}
 if(process.env.LEGACY_TARBALL){
  // Test-only SDK probe in the temporary installed copy; production tarball stays unchanged.
  const file=join(profile,'node_modules/dsh-form-fill-agent/lib/client.js'),source=await readFile(file,'utf8');
  assert.ok(source.includes('function apply(ctx) {'));
  await writeFile(file,source.replace('function apply(ctx) {','function apply(ctx) { window.__coinstallProbe={current:()=>ctx.sessions.list.getSnapshot().current,open:id=>ctx.sessions.open(id),draft:id=>ctx.conversation.input.shell(id).state.getSnapshot().draft,setDraft:(id,value)=>ctx.conversation.input.shell(id).setDraft(value)};'));
 }
 const installedClient=await readFile(join(profile,'node_modules/dsh-form-fill-agent/lib/client.js'),'utf8');
 assert.doesNotMatch(installedClient,/dsh-client-runtime\/client|conversationEvents/);
 const checked=JSON.parse(execFileSync(process.execPath,[join(profile,'node_modules/dsh-form-fill-agent/lib/preflight.js'),'--dsh-bin',bin,'--profile-dir',profile],{env,cwd,encoding:'utf8'}));
 assert.notEqual(checked.status,'blocked');
 const reservation=createServer();await new Promise(ok=>reservation.listen(0,'127.0.0.1',ok));const port=reservation.address().port;await new Promise(ok=>reservation.close(ok));assert.notEqual(port,43120);
 const origin='http://127.0.0.1:'+port,child=spawn(process.execPath,[bin,'--profile','web','--port',String(port),'--no-open'],{env,cwd,stdio:['ignore','pipe','pipe']});
 let output='',browser,phase='startup';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try{
  let healthy=false;
  for(let i=0;i<120;i++){try{healthy=(await fetch(origin+'/form-fill/health')).ok}catch{}if(healthy)break;await new Promise(ok=>setTimeout(ok,250))}
  assert.ok(healthy,'isolated host startup');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
  const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.addLocatorHandler(page.getByRole('button',{name:'继续',exact:true}),async locator=>locator.click());
  await page.addLocatorHandler(page.getByRole('button',{name:'稍后配置',exact:true}),async locator=>locator.click());
  page.on('console',msg=>{if(msg.type()==='error')console.log('Browser error:',msg.text().replace(/https?:\/\/\S+/g,'[url]').slice(0,500))});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,500)));
  const urls=output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\x1b]*/g)||[];
  const local=urls.find(u=>new URL(u).port===String(port)&&u.includes('?'))||origin;
  let rootReady=false;
  for(let attempt=0;attempt<40;attempt++){
   if(child.exitCode!==null)break;
   try{const response=await page.goto(local);if(response?.ok()){rootReady=true;break}}catch{}
   await new Promise(ok=>setTimeout(ok,250));
  }
  assert.ok(rootReady,'host web application route ready');
  if(process.env.TOOL_PROBE==='1'){
   const upload=await page.request.post(origin+'/form-fill/preview',{headers:{origin},data:{base64:fixtureBytes('管道验证',['企业名称','信用代码'],[['合成管道有限公司','']]).toString('base64'),analyzeOnly:true}});assert.equal(upload.status(),200);const task=await upload.json();
   const reply=await page.request.post(origin+'/ff-synthetic-probe',{data:{taskId:task.id,expectedRevision:task.revision}});const probe=await reply.json();assert.equal(reply.status(),200,JSON.stringify(probe));assert.equal(probe.result.isError,false,JSON.stringify(probe));assert.equal(probe.result.value.filled,1);assert.equal(probe.calls,1);assert.equal(probe.snapshotEvents,true);console.log('REAL_HOST_TOOL_PIPELINE synthetic QCC: PASS');
  }
  // No authentication URL, storage state or raw host output is written to disk.
  await page.getByRole('link',{name:'AI填表',exact:true}).waitFor();
  const prepared=await page.evaluate(async ({path,alpha})=>{
   const method=alpha?'workspace/create':'workspace.create',payload=alpha?{args:{request:{path}}}:{path};
   const response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload})});
   return (await response.json()).result;
  },{path:cwd,alpha:!version.startsWith('0.1.1-')});
  assert.equal(prepared?.ok,true,'prepare synthetic workspace through real Host API: '+JSON.stringify(prepared?.error));
  await page.reload();
  let cleaningUrl;
  if(process.env.LEGACY_TARBALL){
   await page.getByRole('button',{name:'数据清洗补全',exact:true}).click();
   await page.getByRole('button',{name:'导入名单',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'导入表格',exact:true}).count(),0);
   cleaningUrl=await page.evaluate(()=>window.__coinstallProbe.current());
   await page.evaluate(id=>window.__coinstallProbe.setDraft(id,'合成清洗手写草稿，保留验证'),cleaningUrl);
   await page.getByRole('button',{name:'导入名单',exact:true}).click();
   await page.getByLabel('粘贴数据',{exact:true}).fill('企业名称\n合成隔离清洗有限公司');
   await page.getByRole('button',{name:'解析数据',exact:true}).click();
   await page.getByText('已核对清单，下一步：字段映射与规则',{exact:true}).waitFor();
  }
  await page.getByRole('link',{name:'AI填表',exact:true}).waitFor();
  await page.getByRole('link',{name:'AI填表',exact:true}).click();
  phase='owned-session';
  if(process.env.LEGACY_TARBALL)assert.equal(await page.getByRole('region',{name:'数据清洗补全工作台',exact:true}).count(),0);
  await page.getByRole('button',{name:'导入表格',exact:true}).waitFor();
  phase='hero-brand';
  await page.locator('.ff-hero h1').waitFor();
  if(process.env.LEGACY_TARBALL){assert.equal(await page.getByRole('button',{name:'导入名单',exact:true}).count(),0);assert.equal(await page.locator('[data-form-fill-top]').count(),1);}
  assert.equal(await page.locator('.ff-hero h1').innerText(),'AI填表智能体');
  assert.ok(await page.locator('[data-form-fill-top]').evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('[data-slot="sidebar.workspaces"]'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  if(process.env.FORM_FILL_SCREENSHOTS){await mkdir(process.env.FORM_FILL_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.FORM_FILL_SCREENSHOTS,'native-'+version+'-home.png')})}
  if(noSidebar){
   const composer=page.locator('[data-composer-card] textarea, [data-composer-card] [contenteditable="true"]').first();
   await composer.fill('合成基础会话草稿，保留验证');
   await page.getByRole('button',{name:'导入表格',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'内嵌工作台暂不可用'}).waitFor();
   assert.equal(await composer.evaluate(el=>el.value??el.textContent),'合成基础会话草稿，保留验证');
   assert.equal(await page.locator('.ff-tab-content').count(),0);
   const href=await page.getByRole('link',{name:'打开独立填表页面'}).getAttribute('href');
   const standalone=await page.context().newPage();standalone.setDefaultTimeout(15000);
   await standalone.goto(origin+href);
   for(const [name,count] of [['客户台账',6],['供应商准入表',4],['合同主体信息表',6]]){
    await standalone.getByRole('button',{name:'导入表格',exact:true}).click();
    await standalone.locator('details:has(#samples)').evaluate(el=>el.open=true);
    await standalone.getByRole('button',{name,exact:true}).click();
    await standalone.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
    assert.equal(await standalone.locator('#changes tr').count(),count);
    await standalone.getByRole('button',{name:'确认下载',exact:true}).click();
    await standalone.getByRole('button',{name:'确认这些填写，生成新副本'}).click();
    const link=standalone.getByRole('link',{name:'下载已填副本'});await link.waitFor();
    const response=await standalone.request.get(new URL(await link.getAttribute('href'),origin+'/form-fill/').href);assert.equal(response.status(),200);assert.ok(parseWorkbook(await response.body()).sheets.length);
   }
   await standalone.getByRole('button',{name:'导入表格',exact:true}).click();
   await standalone.locator('#file').setInputFiles(join(root,'fixtures/xlsx/客户台账.xlsx'));
   await standalone.locator('#mapping').waitFor();await standalone.locator('#configure').click();
   await standalone.getByRole('heading',{name:'主体核验与查询',exact:true}).waitFor();
   const savedHash=await standalone.evaluate(()=>location.hash);assert.match(savedHash,/task=/);
   await standalone.goto(origin+href);await standalone.waitForFunction(hash=>location.hash===hash,savedHash);assert.equal(await standalone.evaluate(()=>location.hash),savedHash);
   await standalone.reload();assert.equal(await standalone.evaluate(()=>location.hash),savedHash);
   await standalone.locator('#task-meta').filter({hasText:'客户台账'}).waitFor();
   await page.getByRole('button',{name:'字段设置',exact:true}).click();
   assert.equal(await composer.evaluate(el=>el.value??el.textContent),'合成基础会话草稿，保留验证');
   await page.getByRole('button',{name:/^(新会话|新建会话|New Session)$/i}).first().click();await page.waitForFunction(()=>!document.querySelector('.ff-hero'));
   await composer.fill('合成普通会话草稿，不发送');assert.equal(await composer.evaluate(el=>el.value??el.textContent),'合成普通会话草稿，不发送');
   assert.deepEqual(pageErrors,[]);
   console.log(JSON.stringify({node:process.version,hostVersion:version,sidebar:null,preflight:checked.status,realHost:'PASS',missingSidebarNotice:'PASS',draftPreserved:'PASS',standaloneFixtureExport:'3/3',uploadMapping:'PASS',savedTaskReload:'PASS',normalSessionDraft:'PASS',pageErrors:0,productionProfileUsed:false,realProviderUsed:false}));
   await standalone.close();continue;
  }
  await page.getByRole('button',{name:'导入表格',exact:true}).click();
  const frame=page.frameLocator('iframe[title="AI填表任务"]');
  await frame.locator('#file').waitFor();
  assert.equal(await page.getByRole('button',{name:'展开工作台',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'关闭工作台',exact:true}).count(),0);
  assert.equal(await page.locator('.ff-tab-content').count(),1);
  await frame.getByText('体验合成模板',{exact:true}).click();
  await frame.getByRole('button',{name:'客户台账',exact:true}).click();
  await frame.locator('#task-meta').filter({hasText:'客户台账'}).waitFor();
  const taskHash=await frame.locator('body').evaluate(()=>location.hash);
  const menu=page.getByRole('navigation',{name:'AI填表快捷菜单'});
  for(const label of ['字段设置','主体核验','填写预览','任务历史','导入表格']){
   await menu.getByRole('button',{name:label,exact:true}).click();
   await menu.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.locator('.ff-tab-content').count(),1);
  }
  await page.getByRole('button',{name:/^(折叠侧边栏|Collapse sidebar)$/}).click();
  await menu.getByRole('button',{name:'字段设置',exact:true}).click();
  await frame.locator('#mapping').waitFor();
  await page.locator('[title="AI填表"]').getByRole('button',{name:/^(关闭|Close)$/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.ff-tab-content').length===0);
  await menu.getByRole('button',{name:'填写预览',exact:true}).click();
  await frame.locator('#summary').waitFor();
  assert.equal(await frame.locator('body').evaluate(()=>location.hash),taskHash);
  phase='business-fixtures';
  for(const [name,count] of [['客户台账',6],['供应商准入表',4],['合同主体信息表',6]]){
   await menu.getByRole('button',{name:'导入表格',exact:true}).click();
   await frame.locator('details:has(#samples)').evaluate(el=>el.open=true);
   await frame.getByRole('button',{name,exact:true}).click();
   await frame.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
   assert.equal(await frame.locator('#changes tr').count(),count);
   await frame.getByRole('button',{name:'确认下载',exact:true}).click();
   await frame.getByRole('button',{name:'确认这些填写，生成新副本'}).click();
   const link=frame.getByRole('link',{name:'下载已填副本'});await link.waitFor();
   const response=await page.request.get(new URL(await link.getAttribute('href'),origin+'/form-fill/').href);
   assert.equal(response.status(),200);assert.ok(parseWorkbook(await response.body()).sheets.length);
  }
  phase='file-upload-mapping';
  await menu.getByRole('button',{name:'导入表格',exact:true}).click();
  await frame.locator('#file').setInputFiles(join(root,'fixtures/xlsx/客户台账.xlsx'));
  await frame.locator('#mapping').waitFor();await frame.locator('#configure').click();
  await frame.getByRole('heading',{name:'主体核验与查询',exact:true}).waitFor();
  phase='native-draft-handoff';
  await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
  await frame.getByText('指令已回填，发送后将在此显示查询进度。',{exact:true}).waitFor();
  assert.match(await page.locator('[data-composer-card]').innerText(),/form_fill_enrich/);
  // Normal session is created by native New Session, not the product launcher.
  phase='normal-session';
  await page.getByRole('button',{name:/^(新会话|新建会话|New Session)$/i}).first().click();
  await page.waitForFunction(()=>!document.querySelector('.ff-hero'));
  assert.equal(await page.getByRole('navigation',{name:'AI填表快捷菜单'}).count(),0);
  const composer=page.locator('[data-composer-card] textarea, [data-composer-card] [contenteditable="true"]').first();await composer.fill('合成普通会话草稿，不发送');
  assert.equal(await composer.evaluate(el=>el.value??el.textContent),'合成普通会话草稿，不发送');
  assert.deepEqual(pageErrors,[]);
  await page.screenshot({path:'/tmp/ff-real-sidebar-'+version+'.png'});
  console.log(JSON.stringify({node:process.version,hostVersion:version,sidebar:process.env.SIDEBAR_VERSION||'0.17.1',context:process.env.CONTEXT_VERSION||null,preflight:checked.status,realHost:'PASS',singleton:'PASS',collapseAndTabClose:'PASS',taskRestore:'PASS',fixturePreviewConfirmExport:'3/3',uploadMapping:'PASS',normalSessionDraft:'PASS',pageErrors:0,productionProfileUsed:false,realProviderUsed:false}));
 }catch(error){console.error('Phase:',phase,'Host exit:',child.exitCode);console.error(output.split('\n').filter(line=>/error|failed|Error|TypeError|incompatible|EADDR/i.test(line)).map(line=>line.replace(/https?:\/\/\S+/g,'[url]')).join('\n'));throw error}
 finally{await browser?.close();if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(ok=>child.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))]);if(child.exitCode===null){child.kill('SIGKILL');await new Promise(ok=>child.once('exit',ok))}}if(!process.env.KEEP_TEST_INSTALL)await rm(join(profile,'node_modules'),{recursive:true,force:true})}
}
