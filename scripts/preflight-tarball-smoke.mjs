// Verify version-policy rejection from the packed product without loading a broken plugin graph.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'ff-packed-preflight-'));
try{
 execFileSync('tar',['-xzf',resolve(process.argv[2]),'-C',dir]);
 const {assessCompatibility}=await import(pathToFileURL(join(dir,'package/lib/preflight.js')));
 for(const [hostVersion,sidebarVersion] of [['0.1.1-rc.2','0.18.1'],['0.1.2-rc.1','0.17.1']])for(const mode of ['basic','workbench']){
  const r=assessCompatibility({nodeVersion:process.version,hostVersion,sidebarVersion,mode});assert.equal(r.status,'blocked');console.log(JSON.stringify({hostVersion,sidebarVersion,mode,result:'BLOCKED PASS'}));
 }
 for(const mode of ['basic','workbench'])assert.equal(assessCompatibility({nodeVersion:process.version,hostVersion:'0.1.2-rc.1',mode}).status,mode==='basic'?'verified-combination':'blocked');
 console.log('Packed preflight missing-sidebar policy PASS');
}finally{await rm(dir,{recursive:true,force:true})}
