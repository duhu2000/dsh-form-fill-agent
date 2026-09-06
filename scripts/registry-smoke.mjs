import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const version='0.1.0-alpha.1';
const directory=await mkdtemp(join(tmpdir(),'form-fill-registry-'));
for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent']){
  const integrity=JSON.parse(execFileSync('npm',['view',name+'@'+version,'dist.integrity','--json','--registry=https://registry.npmjs.org/'],{encoding:'utf8'}));
  assert.equal(integrity,'sha512-'+createHash('sha512').update(await readFile(join(root,'artifacts',name+'-'+version+'.tgz'))).digest('base64'));
}
execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--registry=https://registry.npmjs.org/','dsh-form-fill-agent@'+version],{cwd:directory,stdio:'inherit'});
for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent'])assert.equal((await lstat(join(directory,'node_modules',name))).isSymbolicLink(),false);
const code=`
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {previewBytes} from 'dsh-form-fill-agent';
import {applyChangeSet} from 'form-fill-core';
for(const name of ['客户台账','供应商准入表','合同主体信息表']){
 const input=readFileSync(process.env.FORM_FILL_FIXTURES+'/'+name+'.xlsx');
 const p=await previewBytes(input);
 assert.deepEqual(p,JSON.parse(readFileSync(process.env.FORM_FILL_EXPECTED+'/'+name+'.json')));
 const out=applyChangeSet(input,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId});
 assert.equal((await previewBytes(out.bytes)).changeSet.changes.length,0);
}
console.log('Registry install: integrity 3/3, fixture E2E 3/3, no workspace links PASS');
`;
execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:directory,env:{...process.env,FORM_FILL_FIXTURES:join(root,'fixtures/xlsx'),FORM_FILL_EXPECTED:join(root,'fixtures/expected')},stdio:'inherit'});
