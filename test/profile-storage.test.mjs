import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {profileTaskDirectory} from '../packages/dsh-form-fill-agent/lib/profile-storage.js';
test('installed profiles have separate stores; linked development does not reuse home data',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ff-profile-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['web','desktop']){
  const profile=join(root,'profiles',name);await mkdir(profile,{recursive:true});
  await writeFile(join(profile,'package.json'),JSON.stringify({private:true,dsh:{profile:{bundles:['dsh-form-fill-agent']}}}));
  assert.equal(profileTaskDirectory(pathToFileURL(join(profile,'node_modules/.pnpm/dsh-form-fill-agent/node_modules/dsh-form-fill-agent/lib/index.js'))),join(profile,'form-fill-tasks'));
 }
 assert.equal(profileTaskDirectory(pathToFileURL(join(root,'development/lib/index.js'))),undefined);
});
