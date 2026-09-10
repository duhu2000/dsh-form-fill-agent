import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessCompatibility,inspectInstallation} from '../packages/dsh-form-fill-agent/lib/preflight.js';
const current={nodeVersion:'v22.0.0',hostVersion:'0.1.2-rc.1',sidebarVersion:'0.18.1'};
test('known combinations distinguish optional context and unknown versions',()=>{
 assert.equal(assessCompatibility(current).status,'verified-combination');
 assert.equal(assessCompatibility({...current,contextVersion:'0.48.0'}).status,'verified-combination');
 assert.equal(assessCompatibility({...current,hostVersion:'0.1.1-rc.2',sidebarVersion:'0.17.1'}).status,'verified-combination');
 assert.equal(assessCompatibility({...current,hostVersion:'0.1.2-rc.2'}).status,'unverified');
 assert.equal(assessCompatibility({...current,contextVersion:'0.49.0'}).status,'unverified');
 assert.equal(assessCompatibility({...current,hostVersion:'0.1.1-rc.2',sidebarVersion:'0.17.1',contextVersion:'0.48.0'}).status,'unverified');
});
test('known startup failures are blocked before installation',()=>{
 for(const [overrides,code] of [[{nodeVersion:'20.0.0'},'NODE_TOO_OLD'],[{hostVersion:'0.1.1-rc.2'},'HOST_SIDEBAR'],[{sidebarVersion:'0.17.1'},'SIDEBAR_LEGACY'],[{contextVersion:'0.36.0'},'CONTEXT_LEGACY'],[{sidebarVersion:'0.19.0'},'SIDEBAR_RANGE'],[{sidebarVersion:undefined},'SIDEBAR_MISSING']]){
  const result=assessCompatibility({...current,...overrides});assert.equal(result.status,'blocked');assert.ok(result.issues.some(i=>i.code===code));
 }
});
test('inspect installed metadata and proposed upgrade without touching profile',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ff-preflight-test-'));
 try{
  for(const [name,version] of [['dsh-better-sidebar','0.17.1'],['dsh-context','0.36.0']]){const target=join(dir,'node_modules',name);await mkdir(target,{recursive:true});await writeFile(join(target,'package.json'),JSON.stringify({version}))}
  const bin=join(dir,'host.js');await writeFile(bin,"console.log('0.1.2-rc.1')");
  const before=await readFile(join(dir,'node_modules/dsh-context/package.json'),'utf8');
  const blocked=await inspectInstallation({dshBin:bin,profileDir:dir,sidebarVersion:'0.18.1'});assert.equal(blocked.status,'blocked');assert.equal(blocked.installed.context,'0.36.0');
  const upgraded=await inspectInstallation({dshBin:bin,profileDir:dir,sidebarVersion:'0.18.1',contextVersion:'0.48.0'});assert.equal(upgraded.status,'verified-combination');
  assert.equal(await readFile(join(dir,'node_modules/dsh-context/package.json'),'utf8'),before);
 }finally{await rm(dir,{recursive:true,force:true})}
});
