import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=process.cwd();
for(const entry of [process.env.DSH_RC_BIN,process.env.DSH_ALPHA_BIN].filter(Boolean)){
 assert.ok(entry);const bin=resolve(entry),home=await mkdtemp(join(tmpdir(),'form-fill-native-')),cwd=join(home,'synthetic-workspace'),profile=join(home,'profiles/web');
 await mkdir(cwd);await mkdir(profile,{recursive:true});
 const dependencies={'dsh-better-sidebar':process.env.SIDEBAR_VERSION||'0.17.1'};
 for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent']){
  const {version}=JSON.parse(await readFile(join(root,'packages',name,'package.json')));
  dependencies[name]='file:'+join(root,'artifacts',name+'-'+version+'.tgz');
 }
 await writeFile(join(profile,'package.json'),JSON.stringify({name:'synthetic-native-test',version:'0.0.0',private:true,type:'module',dependencies,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-better-sidebar','dsh-form-fill-agent']}}}));
 if(process.env.LEGACY_TARBALL){const file=join(profile,'package.json'),manifest=JSON.parse(await readFile(file));manifest.dependencies['dsh-data-cleaning-agent']='file:'+resolve(process.env.LEGACY_TARBALL);manifest.dsh.profile.bundles.push('dsh-data-cleaning-agent');await writeFile(file,JSON.stringify(manifest));}
 execFileSync('npm',['install','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:profile,stdio:'pipe'});
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
  await page.screenshot({path:'/tmp/ff-real-sidebar-'+version+'.png'});
  console.log(JSON.stringify({hostVersion:version,sidebar:process.env.SIDEBAR_VERSION||'0.17.1',realHost:'PASS',singleton:'PASS',collapseAndTabClose:'PASS',taskRestore:'PASS',productionProfileUsed:false,realProviderUsed:false}));
 }catch(error){console.error('Phase:',phase);throw error}
 finally{await browser?.close();child.kill('SIGTERM')}
}
