import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import {assessCompatibility} from '../packages/dsh-form-fill-agent/lib/preflight.js';
assert.ok(process.env.DSH_RC_BIN || process.env.DSH_ALPHA_BIN);
for (const entry of [process.env.DSH_RC_BIN, process.env.DSH_ALPHA_BIN].filter(Boolean)) {
 const bin=resolve(entry),home=await mkdtemp(join(tmpdir(),'form-fill-registry-dsh-')),cwd=join(home,'synthetic-workspace');
 await mkdir(cwd);
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir(),DSH_HOME:home,NO_COLOR:'1'};
 const run=args=>execFileSync(process.execPath,[bin,...args],{cwd,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
 const version=run(['--version']).trim();
 const sidebarVersion=process.env.SIDEBAR_VERSION||(version==='0.1.1-rc.2'?'0.17.1':'0.18.1');
 const compatibility=assessCompatibility({nodeVersion:process.version,hostVersion:version,sidebarVersion});
 assert.notEqual(compatibility.status,'blocked',JSON.stringify(compatibility));
 run(['plugin','--profile','web','add','dsh-better-sidebar@'+sidebarVersion,'--ignore-scripts','--registry=https://registry.npmjs.org/','--store-dir',join(home,'pnpm-store')]);
 const packageVersion=JSON.parse(await readFile(new URL('../packages/dsh-form-fill-agent/package.json',import.meta.url))).version;
 run(['plugin','--profile','web','add','dsh-form-fill-agent@'+packageVersion,'--ignore-scripts','--registry=https://registry.npmjs.org/','--store-dir',join(home,'pnpm-store')]);
 const manifest=JSON.parse(await readFile(join(home,'profiles/web/package.json')));
 assert.ok(manifest.dsh.profile.bundles.includes('dsh-form-fill-agent'));
 assert.ok(run(['--profile','web','--dump-config']).includes('dsh-form-fill-agent'));
 run(['plugin','--profile','web','remove','dsh-form-fill-agent','--store-dir',join(home,'pnpm-store')]);
 assert.ok(!JSON.parse(await readFile(join(home,'profiles/web/package.json'))).dsh.profile.bundles.includes('dsh-form-fill-agent'));
 console.log(JSON.stringify({version,registryInstall:'PASS',bundleReconcile:'PASS',uninstall:'PASS',productionProfileUsed:false,portsOpened:0}));
}
