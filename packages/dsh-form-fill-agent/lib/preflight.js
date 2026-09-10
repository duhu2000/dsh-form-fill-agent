#!/usr/bin/env node
// Read-only installation planning. Never imports plugins, reads credentials or mutates a profile.
import {readFile, realpath, mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export function assessCompatibility({nodeVersion,hostVersion,sidebarVersion,contextVersion}) {
 const issues=[];
 const add=(severity,code,message)=>issues.push({severity,code,message});
 if(Number(String(nodeVersion).replace(/^v/,'').split('.')[0])<22)add('blocked','NODE_TOO_OLD','AI 填表需要 Node.js >=22；请先更新运行该 DSH 的 Node.js。');
 if(!hostVersion)add('blocked','HOST_UNKNOWN','无法读取实际 DSH 版本；请用 --dsh-bin 指定实际 dsh 可执行文件。');
 if(!sidebarVersion)add('blocked','SIDEBAR_MISSING','侧栏未安装；请选择与宿主对应的版本，通过 dsh plugin --profile <名称> add dsh-better-sidebar@<版本> 安装。');
 if(sidebarVersion&&!/^0\.(?:17|18)\.\d+$/.test(sidebarVersion)||sidebarVersion==='0.17.0')add('blocked','SIDEBAR_RANGE','侧栏必须满足 >=0.17.1 <0.19.0；请使用已验证的固定版本，不要直接使用 latest。');
 if(hostVersion==='0.1.1-rc.2'&&/^0\.18\./.test(sidebarVersion||''))add('blocked','HOST_SIDEBAR','旧 DSH 缺少 SessionLogOffset，不能加载该侧栏。保留 dsh-better-sidebar@0.17.1，或由宿主管理者升级完整 DSH 到 0.1.2-rc.1 后安装 0.18.1；不要只升级单个 SDK 包。');
 if(hostVersion==='0.1.2-rc.1'&&sidebarVersion==='0.17.1')add('blocked','SIDEBAR_LEGACY','Better Sidebar 0.17.1 使用旧 settingsNamespace，不能加载到 DSH 0.1.2-rc.1。请在同一 profile 安装 dsh-better-sidebar@0.18.1。');
 if(hostVersion==='0.1.2-rc.1'&&contextVersion==='0.36.0')add('blocked','CONTEXT_LEGACY','已安装 dsh-context@0.36.0 使用旧 settingsNamespace，会阻断新宿主。升级前备份 profile，将已安装的 context 升级到 0.48.0；例如 dsh plugin --profile <名称> add dsh-context@0.48.0。context 不是 AI 填表必装项。');
 if(contextVersion&&!(hostVersion==='0.1.2-rc.1'&&['0.48.0','0.36.0'].includes(contextVersion)))add('warning','CONTEXT_UNVERIFIED','此宿主与 context 组合未纳入当前共存验证；不要据此推断兼容。');
 const known=hostVersion==='0.1.1-rc.2'&&sidebarVersion==='0.17.1'||hostVersion==='0.1.2-rc.1'&&sidebarVersion==='0.18.1';
 if(!known)add('warning','COMBINATION_UNVERIFIED','此宿主与侧栏组合未验证；版本范围可接受不等于已通过业务验收。');
 const blocked=issues.some(i=>i.severity==='blocked');
 return {status:blocked?'blocked':issues.length?'unverified':'verified-combination',nodeVersion,hostVersion,sidebarVersion,contextVersion:contextVersion||null,issues,scope:'版本预检；不代表模型、MCP 权限或全部业务验收通过。不会自动安装、升级、重启。'};
}

export async function inspectInstallation({dshBin,profileDir,sidebarVersion,contextVersion}) {
 if(!(await stat(profileDir)).isDirectory())throw Error('指定 profile 路径不是目录，无法核对已安装插件。');
 const installed=async name=>{try{return JSON.parse(await readFile(join(profileDir,'node_modules',name,'package.json'),'utf8')).version}catch(e){if(e.code==='ENOENT')return undefined;throw e}};
 const installedSidebar=await installed('dsh-better-sidebar'),installedContext=await installed('dsh-context');
 // Run version command with an empty environment profile to avoid activating the actual plugin tree.
 const isolatedHome=await mkdtemp(join(tmpdir(),'form-fill-preflight-'));let raw;
 try{raw=execFileSync(dshBin.endsWith('.js')?process.execPath:dshBin,[...(dshBin.endsWith('.js')?[dshBin]:[]),'--version'],{cwd:isolatedHome,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:isolatedHome,DSH_HOME:isolatedHome,NO_COLOR:'1'}}).trim()}finally{await rm(isolatedHome,{recursive:true,force:true})}
 const hostVersion=raw.match(/\b\d+\.\d+\.\d+(?:-[\w.]+)?\b/)?.[0];
 return {...assessCompatibility({nodeVersion:process.version,hostVersion,sidebarVersion:sidebarVersion||installedSidebar,contextVersion:contextVersion||installedContext}),installed:{sidebar:installedSidebar||null,context:installedContext||null},proposed:{sidebar:sidebarVersion||null,context:contextVersion||null}};
}

if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>resolve(process.argv[1]))===fileURLToPath(import.meta.url)) {
 try {
  const args=process.argv.slice(2),options={};
  if(args.includes('--help')){console.log('form-fill-preflight --dsh-bin /absolute/path/to/dsh --profile-dir /path/to/profiles/web [--sidebar-version 0.18.1] [--context-version 0.48.0]\n只读当前版本；可预检计划安装版本。阻断退出码 2，未验证组合会显式提示。');}
  else {
   const keys={'--dsh-bin':'dshBin','--profile-dir':'profileDir','--sidebar-version':'sidebarVersion','--context-version':'contextVersion'};
   for(let i=0;i<args.length;i+=2){if(!keys[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw Error('无效参数；使用 --help 查看用法');options[keys[args[i]]]=args[i+1]}
   if(!options.dshBin||!options.profileDir)throw Error('必须指定 --dsh-bin 和 --profile-dir；不默认读取生产 profile。');
   const result=await inspectInstallation(options);console.log(JSON.stringify(result,null,2));if(result.status==='blocked')process.exitCode=2;
  }
 } catch(error){console.error('预检未完成：'+error.message);process.exitCode=2}
}
