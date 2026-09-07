import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const legacy = resolve(process.env.LEGACY_REPO ?? join(root, '../dsh-data-cleaning-agent-form-fill-compat'));
const sandbox = await mkdtemp(join(tmpdir(), 'form-fill-consumers-'));
const names = ['form-fill-core', 'qcc-form-fill-provider', 'dsh-form-fill-agent', 'qcc-field-contracts'];
const versions = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await readFile(join(root,'packages',name,'package.json'))).version])));
execFileSync(process.execPath, [join(root, 'scripts/verify-pack.mjs')], { stdio: 'inherit' });
const packed = join(sandbox, 'dsh-form-fill-agent/artifacts');
await mkdir(packed, { recursive: true });
const tarballs = [];
for (const name of names) {
  const file = name + '-' + versions[name] + '.tgz';
  await cp(join(root, 'artifacts', file), join(packed, file));
  tarballs.push(join(packed, file));
}
const oldConsumer = join(sandbox, 'dsh-data-cleaning-agent');
// Stage current authorized source files, including new golden tests; no ignored
// profiles, credentials, node_modules, raw responses, or developer scratch trees.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: legacy, encoding: 'utf8' }).trim().split('\n');
for (const file of files) {
  const target = join(oldConsumer, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(legacy, file), target);
}
const npmArgs = ['install', ...(process.env.CONSUMER_ONLINE==='1'?[]:['--offline']), '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--package-lock=false'];
let latestGolden;
if(process.env.LEGACY_ADAPT==='1'){
 execFileSync('npm',npmArgs,{cwd:oldConsumer,stdio:'pipe'});
 execFileSync('npm',['run','check'],{cwd:oldConsumer,stdio:'pipe',maxBuffer:16*1024*1024});
 await mkdir(join(oldConsumer,'test/helpers'),{recursive:true});
 await cp(join(root,'fixtures/legacy-characterization.mjs'),join(oldConsumer,'test/helpers/form-fill-parity.mjs'));
 const collect=()=>execFileSync(process.execPath,['--input-type=module','-e','import {collectLegacy} from "./test/helpers/form-fill-parity.mjs";console.log(JSON.stringify(await collectLegacy()))'],{cwd:oldConsumer,encoding:'utf8'});
 latestGolden=JSON.parse(collect());
 assert.equal(latestGolden.cases.length,24);
 const enginePath=join(oldConsumer,'lib/engine.js'),source=await readFile(enginePath,'utf8');
 const start=source.indexOf('export function parseCsv(text) {'),end=source.indexOf('/** 懒加载 xlsx',start);
 assert.ok(start>=0&&end>start,'recognized latest parser boundary');
 await writeFile(enginePath,source.slice(0,start)+'export { parseCsv } from "form-fill-core/legacy-csv";\n\n'+source.slice(end));
}
const legacyManifest=JSON.parse(await readFile(join(oldConsumer,'package.json')));
legacyManifest.dependencies['form-fill-core']='file:'+tarballs[0];
legacyManifest.dependencies['qcc-field-contracts']='file:'+tarballs[3];
await writeFile(join(oldConsumer,'package.json'),JSON.stringify(legacyManifest,null,2));
execFileSync('npm', npmArgs, { cwd: oldConsumer, stdio: 'inherit' });
assert.equal(JSON.parse(await readFile(join(oldConsumer,'node_modules/form-fill-core/package.json'))).version,versions['form-fill-core']);
assert.equal((await lstat(join(oldConsumer, 'node_modules/form-fill-core'))).isSymbolicLink(), false);
const oldLog = execFileSync('npm', ['run', 'check'], { cwd: oldConsumer, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
console.log(oldLog);
if(latestGolden){
 const actual=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e','import {collectLegacy} from "./test/helpers/form-fill-parity.mjs";console.log(JSON.stringify(await collectLegacy()))'],{cwd:oldConsumer,encoding:'utf8'}));
 assert.deepEqual(actual,latestGolden);
 console.log('Latest baseline '+execFileSync('git',['rev-parse','HEAD'],{cwd:legacy,encoding:'utf8'}).trim()+': before/after full checks + 24 golden parity PASS');
}
if(process.env.LEGACY_ADAPT==='1'){
 const fixture=JSON.parse(await readFile(join(root,'fixtures/extended-provider.golden.json'))),old=await import(pathToFileURL(join(legacy,'lib/qcc.js'))),catalog=await import(pathToFileURL(join(legacy,'lib/qcc-field-catalog.js')));
 assert.deepEqual(catalog.QCC_FIELD_CATALOG.filter(g=>g.id!=='actual_controller'),fixture.catalog);for(const c of fixture.cases)assert.deepEqual(old[c.mapper](c.input),c.expected);
 console.log('Latest legacy Provider: 128 catalog + 21 projection golden parity PASS');
}
const newConsumer = join(sandbox, 'standalone-form-fill');
await mkdir(newConsumer);
execFileSync('npm', [...npmArgs, ...tarballs], { cwd: newConsumer, stdio: 'inherit' });
for (const name of names) {
  assert.equal((await lstat(join(newConsumer, 'node_modules', name))).isSymbolicLink(), false);
  assert.equal(JSON.parse(await readFile(join(newConsumer, 'node_modules', name, 'package.json'))).version, versions[name]);
}
const code = [
  'import {readFileSync} from "node:fs";',
  'import assert from "node:assert/strict";',
  'import {previewBytes} from "dsh-form-fill-agent";',
  'import {createCatalogProvider,QCC_FIELD_CATALOG} from "qcc-form-fill-provider";',
  'const extra=JSON.parse(readFileSync(process.env.EXTENDED_GOLDEN));assert.deepEqual(QCC_FIELD_CATALOG,extra.catalog);',
  'for(const c of extra.cases.filter(c=>c.variant==="full")){const company="合成扩展有限公司",source={...c.input,...(c.input.企业名称?{企业名称:company}:{})},group=extra.catalog.find(g=>g.sourceTool===c.tool);const provider=createCatalogProvider({availableTools:[c.tool],callTool:async(name,args)=>name==="get_company_registration_info"?{企业名称:args.searchKey}:source});const result=await provider.lookup({capability:"qcc-"+c.tool,anchor:{company_name:company},fields:group.fields.map(f=>f.id)});assert.equal(result.status,"exact");for(const [field,fact]of Object.entries(result.values))assert.equal(fact.value,String(field==="tax_company_name"?company:c.expected[field]));}',
  'console.log("standalone Provider tarball: 7 groups PASS");',
  'import {ACTUAL_CONTROLLER_GROUP,projectActualController} from "qcc-field-contracts";',
  'const d={企业名称:"合成测试有限公司",total_count:1,has_more:false,next_cursor:null,实际控制人信息:[{实际控制人名称:"合成甲",总持股比例:"47.6955%"}]};',
  'const cp=createCatalogProvider({availableTools:["get_actual_controller"],callTool:async(t,a)=>t==="get_company_registration_info"?{企业名称:a.searchKey}:d});const cr=await cp.lookup({capability:"qcc-get_actual_controller",anchor:{company_name:d.企业名称},fields:ACTUAL_CONTROLLER_GROUP.fields.map(f=>f.id)});assert.equal(cr.values.actual_controller_name.value,projectActualController(d).values.actual_controller_name);assert.equal(cr.values.actual_controller_total_ratio.value,"47.6955%");console.log("Standalone controller shared package + Provider PASS");',
  'import {applyChangeSet,parseWorkbook} from "form-fill-core";',
  'for (const name of ["客户台账","供应商准入表","合同主体信息表"]) {',
  ' const bytes=readFileSync(process.env.FIXTURE_ROOT+"/"+name+".xlsx");',
  ' const p=await previewBytes(bytes); const expected=JSON.parse(readFileSync(process.env.EXPECTED_ROOT+"/"+name+".json")); assert.deepEqual(p,expected);',
  ' const out=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}); assert.ok(parseWorkbook(out.bytes).sheets.length);',
  ' assert.equal((await previewBytes(out.bytes)).changeSet.changes.length,0);',
  '} console.log("standalone tarball E2E: 3/3 PASS; no workspace symlinks");',
].join('\n');
execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: newConsumer, env: { ...process.env, EXTENDED_GOLDEN:join(root,'fixtures/extended-provider.golden.json'), FIXTURE_ROOT: join(root, 'fixtures/xlsx'), EXPECTED_ROOT: join(root, 'fixtures/expected') }, stdio: 'inherit' });
console.log(JSON.stringify({ kind: 'consumer-contract', legacy: 'full-check + 24 golden cases PASS', formFill: '3 fixture E2E PASS', workspaceLinks: false, published: false, sandbox }));
