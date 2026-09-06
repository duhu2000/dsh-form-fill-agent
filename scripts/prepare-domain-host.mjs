// Clone only an already authorized isolated test model configuration; never a production home.
import {mkdtemp,mkdir,readFile,writeFile,copyFile,chmod} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const [sourceArg,portArg]=process.argv.slice(2),source=resolve(sourceArg),port=Number(portArg);
assert.ok(basename(source).startsWith('form-fill-native-'));assert.ok(port>1024&&port!==43120);
assert.equal(JSON.parse(await readFile(join(source,'profiles/web/package.json'))).name,'synthetic-native-test');
const home=await mkdtemp(join(tmpdir(),'form-fill-native-domains-')),profile=join(home,'profiles/web');
await chmod(home,0o700);await mkdir(profile,{recursive:true});await mkdir(join(home,'synthetic-workspace'));
for(const name of ['settings.yaml','.credentials.yaml']){await copyFile(join(source,name),join(home,name));await chmod(join(home,name),0o600)}
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest={name:'synthetic-native-test',version:'0.0.0',private:true,type:'module',dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-form-fill-agent']}}};
for(const name of ['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent']){const {version}=JSON.parse(await readFile(join(root,'packages',name,'package.json')));manifest.dependencies[name]='file:'+join(root,'artifacts',name+'-'+version+'.tgz')}
await writeFile(join(profile,'package.json'),JSON.stringify(manifest));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:profile,stdio:'pipe'});
const clients=['company','operation','risk'].map(domain=>({id:'form-fill-test-'+domain,name:'@deepseek-ai/dsh-mcp-client',config:{serverName:'qcc-'+domain,transport:'stdio',command:process.execPath,args:[join(root,'scripts/live-connector-bridge.mjs'),'stdio',domain,String(port)]}}));
// The SDK intentionally filters inherited environment; pass the ephemeral key
// by runtime expression, never its value. No credential is present on disk.
const patch='- insert:\n'+clients.map(c=>'    - id: '+c.id+'\n      name: '+JSON.stringify(c.name)+'\n      config:\n        serverName: '+c.config.serverName+'\n        transport: stdio\n        toolCallTimeoutMs: 120000\n        command: '+JSON.stringify(c.config.command)+'\n        args: '+JSON.stringify(c.config.args)+'\n        env:\n          FORM_FILL_BRIDGE_KEY: !!js "process.env.FORM_FILL_BRIDGE_KEY"\n').join('');
await writeFile(join(profile,'cordis.patch.yml'),patch,{mode:0o600});
console.log(JSON.stringify({home,profile:'isolated',domains:3,productionProfileUsed:false}));
