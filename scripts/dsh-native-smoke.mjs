import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=process.cwd();
for(const entry of [process.env.DSH_RC_BIN,process.env.DSH_ALPHA_BIN]){
 assert.ok(entry);const bin=resolve(entry),home=await mkdtemp(join(tmpdir(),'form-fill-native-')),cwd=join(home,'synthetic-workspace'),profile=join(home,'profiles/web');
 await mkdir(cwd);await mkdir(profile,{recursive:true});
 const dependencies={};
 for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent']){
  const {version}=JSON.parse(await readFile(join(root,'packages',name,'package.json')));
  dependencies[name]='file:'+join(root,'artifacts',name+'-'+version+'.tgz');
 }
 await writeFile(join(profile,'package.json'),JSON.stringify({name:'synthetic-native-test',version:'0.0.0',private:true,type:'module',dependencies,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-form-fill-agent']}}}));
 if(process.env.LEGACY_TARBALL){const file=join(profile,'package.json'),manifest=JSON.parse(await readFile(file));manifest.dependencies['dsh-data-cleaning-agent']='file:'+resolve(process.env.LEGACY_TARBALL);manifest.dsh.profile.bundles.push('dsh-data-cleaning-agent');await writeFile(file,JSON.stringify(manifest));}
 execFileSync('npm',['install','--offline','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:profile,stdio:'pipe'});
 if(process.env.LEGACY_TARBALL){
  // Test-only SDK probe in the temporary installed copy; production tarball stays unchanged.
  const file=join(profile,'node_modules/dsh-form-fill-agent/lib/client.js'),source=await readFile(file,'utf8');
  assert.ok(source.includes('function apply(ctx) {'));
  await writeFile(file,source.replace('function apply(ctx) {','function apply(ctx) { window.__coinstallProbe={current:()=>ctx.sessions.list.getSnapshot().current,open:id=>ctx.sessions.open(id),draft:id=>ctx.conversation.input.shell(id).state.getSnapshot().draft,setDraft:(id,value)=>ctx.conversation.input.shell(id).setDraft(value)};'));
 }
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir(),DSH_HOME:home,NO_COLOR:'1'};
 const version=execFileSync(process.execPath,[bin,'--version'],{env,cwd,encoding:'utf8'}).trim();
 const reservation=createServer();await new Promise(ok=>reservation.listen(0,'127.0.0.1',ok));const port=reservation.address().port;await new Promise(ok=>reservation.close(ok));assert.notEqual(port,43120);
 const origin='http://127.0.0.1:'+port,child=spawn(process.execPath,[bin,'--profile','web','--port',String(port),'--no-open'],{env,cwd,stdio:['ignore','pipe','pipe']});
 let output='',browser,phase='startup';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try{
  let healthy=false;
  for(let i=0;i<120;i++){try{healthy=(await fetch(origin+'/form-fill/health')).ok}catch{}if(healthy)break;await new Promise(ok=>setTimeout(ok,250))}
  assert.ok(healthy,'isolated host startup');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
  await page.addLocatorHandler(page.getByRole('button',{name:'继续',exact:true}),async locator=>locator.click());
  await page.addLocatorHandler(page.getByRole('button',{name:'稍后配置',exact:true}),async locator=>locator.click());
  page.on('console',msg=>{if(msg.type()==='error')console.log('Browser error:',msg.text().replace(/https?:\/\/\S+/g,'[url]').slice(0,500))});
  page.on('pageerror',error=>console.log('Page error:',error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,500)));
  const urls=output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\x1b]*/g)||[];
  const local=urls.find(u=>new URL(u).port===String(port)&&u.includes('?'))||origin;
  await page.goto(local);
  // No authentication URL, storage state or raw host output is written to disk.
  await page.getByRole('link',{name:'AI填表',exact:true}).waitFor();
  const prepared=await page.evaluate(async ({path,alpha})=>{
   const method=alpha?'workspace/create':'workspace.create',payload=alpha?{args:{request:{path}}}:{path};
   const response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload})});
   return (await response.json()).result;
  },{path:cwd,alpha:version.includes('alpha')});
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
  await page.getByRole('button',{name:'导入表格',exact:true}).click();
  const frame=page.frameLocator('iframe[title="AI填表任务"]');
  phase='sample';
  await page.waitForFunction(()=>{const c=document.querySelector('[data-composer-card]')?.getBoundingClientRect(),p=document.querySelector('.ff-panel')?.getBoundingClientRect();return c&&p&&c.right<=p.left+1});
  const composer=await page.locator('[data-composer-card]').boundingBox(),panel=await page.getByRole('region',{name:'AI填表工作台'}).boundingBox();
  if(composer?.x+composer?.width>panel?.x+1)console.log('Composer ancestors:',await page.locator('[data-composer-card]').evaluate(e=>{const rows=[];for(let n=e;n&&rows.length<9;n=n.parentElement)rows.push({tag:n.tagName,attributes:[...n.attributes].map(a=>[a.name,a.value]).filter(([k])=>k!=='style')});return rows}));
  assert.ok(composer&&panel&&composer.x+composer.width<=panel.x+1,'workbench must not cover native composer: '+JSON.stringify({composer,panel}));
  await frame.locator('details:has(#samples)').evaluate(el=>el.open=true);
  await frame.getByRole('button',{name:'客户台账',exact:true}).click();
  await frame.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
  assert.equal(await frame.locator('#changes tr').count(),6);
  phase='draft';
  await page.getByRole('button',{name:'主体核验',exact:true}).click();
  await frame.getByRole('button',{name:'生成填写指令',exact:true}).click();
  await frame.getByRole('button',{name:'4 确认描述',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ff-panel').getBoundingClientRect().width===innerWidth);
  if(process.env.FORM_FILL_SCREENSHOTS)await page.screenshot({path:join(process.env.FORM_FILL_SCREENSHOTS,'native-'+version+'-wizard.png')});
  await frame.getByRole('button',{name:'回填到对话框',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('textarea,[contenteditable=true]')].some(e=>(e.value||e.textContent).includes('form_fill_enrich')));
  phase='download';
  await frame.getByRole('button',{name:'5 确认与下载',exact:true}).click();
  await frame.getByRole('button',{name:'确认这些填写，生成新副本',exact:true}).click();
  const download=frame.getByRole('link',{name:'下载已填副本',exact:true});await download.waitFor();
  assert.equal((await page.request.get(origin+await download.getAttribute('href'))).status(),200);
  phase='restore';
  await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
  await page.getByRole('button',{name:'填写预览',exact:true}).click();
  await frame.locator('#changes tr').nth(5).waitFor();
  phase='ordinary-session';
  if(process.env.LEGACY_TARBALL)for(let round=0;round<3;round++){
   const formUrl=await page.evaluate(()=>window.__coinstallProbe.current());assert.notEqual(formUrl,cleaningUrl,'native sessions must have distinct identities');
   await page.evaluate(id=>window.__coinstallProbe.open(id),cleaningUrl);await page.locator('.ff-hero').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(id=>window.__coinstallProbe.draft(id),cleaningUrl),'合成清洗手写草稿，保留验证');
   // Cleaning 0.8.8 intentionally releases ownership on exit; re-entry creates a new business session.
   await page.getByRole('button',{name:'数据清洗补全',exact:true}).click();await page.getByRole('button',{name:'导入名单',exact:true}).waitFor();
   assert.equal(await page.locator('.ff-hero').count(),0);
   await page.getByRole('button',{name:'导入名单',exact:true}).click();
   await page.getByLabel('粘贴数据',{exact:true}).waitFor();
   assert.doesNotMatch(await page.getByLabel('粘贴数据',{exact:true}).inputValue(),/form_fill_enrich/);
   await page.evaluate(id=>window.__coinstallProbe.open(id),formUrl);await page.getByRole('button',{name:'填写预览',exact:true}).click();
   await frame.locator('#changes tr').nth(5).waitFor();
  }
  await page.getByRole('button',{name:'关闭工作台',exact:true}).click();
  await page.getByRole('button',{name:'新建会话',exact:true}).first().click();
  await page.getByRole('button',{name:'导入表格',exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('.ff-hero').count(),0);
  console.log(JSON.stringify({version,nativeEntry:'PASS',ownedSession:'PASS',samplePreview:6,nativeDraft:'PASS',composerUnobscured:'PASS',download:'PASS',restore:'PASS',ordinarySession:'PASS',realModel:'NOT_TESTED',qcc:'NOT_CONNECTED',productionProfileUsed:false}));
  if(process.env.FORM_FILL_KEEP_HOST==='1'&&entry===process.env.DSH_ALPHA_BIN){
   await browser.close();browser=undefined;
   console.log(JSON.stringify({isolatedSetupUrl:origin,isolatedHome:home,awaiting:'Configure test model credentials and QCC MCP in this isolated Host UI; never paste secrets into chat.'}));
   await new Promise(ok=>{process.once('SIGINT',ok);process.once('SIGTERM',ok)});
  }
 }catch(error){
  // Fresh synthetic profile only: report visible UI labels, never tokens or network bodies.
  if(browser){const pages=browser.contexts().flatMap(c=>c.pages());const page=pages[0];if(page){console.log('Synthetic UI labels:',await page.locator('button,a,h1,h2').allTextContents());console.log('Synthetic hero structure:',await page.locator('[class*="headlineText"]').evaluateAll(nodes=>nodes.map(e=>{const out=[];for(let n=e;n&&out.length<5;n=n.parentElement)out.push({tag:n.tagName,class:n.className,display:n.style.display});return out})));if(process.env.FORM_FILL_SCREENSHOTS)await page.screenshot({path:join(process.env.FORM_FILL_SCREENSHOTS,'native-failure.png')})}}
  throw Error('Native host acceptance failed ('+phase+'): '+String(error.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,2500));
 }finally{
  await browser?.close();child.kill('SIGTERM');
  if(child.exitCode===null)await Promise.race([new Promise(ok=>child.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
}
