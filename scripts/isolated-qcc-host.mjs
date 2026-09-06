// Local test launcher. Supply {"authorization":"Bearer ..."} on stdin, never argv.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const [homeArg,binArg,portArg]=process.argv.slice(2),home=resolve(homeArg),bin=resolve(binArg),port=Number(portArg);
assert.ok(basename(home).startsWith('form-fill-native-'),'Use a generated isolated native test home');
assert.ok(Number.isInteger(port)&&port>1024&&port<65536&&port!==43120);
const profile=join(home,'profiles/web'),manifest=JSON.parse(await readFile(join(profile,'package.json'),'utf8'));
assert.equal(manifest.name,'synthetic-native-test');
const input=createInterface({input:process.stdin,terminal:false});
const [line]=await once(input,'line');input.close();process.stdin.pause();
const {authorization}=JSON.parse(line);
assert.ok(typeof authorization==='string'&&/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization),'Expected a Bearer credential');
const patch=`- insert:
    - id: form-fill-isolated-qcc
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: qcc-company
        transport: streamable-http
        url: https://agent.qcc.com/mcp/company/stream
        headers:
          Authorization: !!js "'Bearer ' + process.env.QCC_MCP_TOKEN"
`;
const patchPath=join(profile,'cordis.patch.yml');
let existing;try{existing=await readFile(patchPath,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
if(existing===undefined)await writeFile(patchPath,patch,{flag:'wx',mode:0o600});
else assert.equal(existing,patch,'Preserve existing user patch; use a fresh isolated test home');
const browserLaunchRequested=process.env.FORM_FILL_OPEN_BROWSER==='1';
const child=spawn(process.execPath,[bin,'--profile','web','--port',String(port),...(browserLaunchRequested?[]:['--no-open'])],{
 cwd:join(home,'synthetic-workspace'),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,DSH_HOME:home,NO_COLOR:'1',QCC_MCP_TOKEN:authorization.slice(7)},stdio:['ignore','pipe','pipe']
});
// Let DSH open its authenticated local browser URL; never print or save that URL.
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
process.once('SIGINT',()=>child.kill('SIGTERM'));process.once('SIGTERM',()=>child.kill('SIGTERM'));
const origin='http://127.0.0.1:'+port;
let health;
for(let i=0;i<100;i++){
 if(child.exitCode!==null)break;
 try{const response=await fetch(origin+'/form-fill/health');if(response.ok){health=await response.json();if(health.qccAvailable)break}}catch{}
 await new Promise(ok=>setTimeout(ok,300));
}
if(!health){child.kill('SIGTERM');throw Error('Isolated Host did not become healthy; raw logs intentionally omitted')}
console.log(JSON.stringify({isolatedSetupUrl:origin,browserLaunchRequested,qccAvailable:health.qccAvailable,qccCredentialOnDisk:false,productionProfileUsed:false}));
await once(child,'exit');
