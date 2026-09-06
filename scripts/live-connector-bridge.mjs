// Test-only transport: an authenticated connector orchestrator supplies real
// responses over stdin. No credentials, responses or company names go to disk.
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const domains={company:['get_company_registration_info'],operation:['get_import_export_credit'],risk:['get_company_risk_scan','get_company_related_risk_scan']};
const [mode,domain,portArg]=process.argv.slice(2);
assert.match(process.env.FORM_FILL_BRIDGE_KEY||'',/^[a-f0-9]{64}$/,'A runtime-only bridge key is required');
const lines=createInterface({input:process.stdin});
if(mode==='broker'){
 const pending=new Map();let company;
 const server=createServer(async(req,res)=>{
  if(req.method!=='POST'||req.headers.authorization!=='Bearer '+process.env.FORM_FILL_BRIDGE_KEY){res.writeHead(403).end();return}
  try{
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('size')}
   const call=JSON.parse(body);assert.ok(company&&Object.values(domains).flat().includes(call.name));
   assert.deepEqual(call.arguments,{searchKey:company});
   const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);res.writeHead(504).end()},110000);
   pending.set(id,{res,timer});console.log(JSON.stringify({id,tool:call.name}));
  }catch{res.writeHead(400).end()}
 });
 lines.on('line',line=>{try{const message=JSON.parse(line);if(message.company){company=message.company;return}const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);item.res.setHeader('Content-Type','application/json');item.res.end(JSON.stringify(message.result))}catch{}});
 server.listen(0,'127.0.0.1',()=>{assert.notEqual(server.address().port,43120);console.log(JSON.stringify({bridgePort:server.address().port}))});
 lines.on('close',()=>{for(const {res,timer} of pending.values()){clearTimeout(timer);res.end()}server.close()});
}else{
 assert.equal(mode,'stdio');assert.ok(domains[domain]);const port=Number(portArg);assert.ok(port>1024&&port!==43120);
 lines.on('line',async line=>{
  let m;try{m=JSON.parse(line);if(m.id===undefined)return;let result;
   if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'real-connector-test-'+domain,version:'1.0.0'}};
   else if(m.method==='tools/list')result={tools:domains[domain].map(name=>({name,description:'企查查真实工具；返回客观字段，不推断风险，不跨维求和。测试桥接不生成或缓存数据。',inputSchema:{type:'object',properties:{searchKey:{type:'string'}},required:['searchKey'],additionalProperties:false}}))};
   else if(m.method==='ping')result={};
   else if(m.method==='tools/call'){
    assert.ok(domains[domain].includes(m.params.name));
    const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{Authorization:'Bearer '+process.env.FORM_FILL_BRIDGE_KEY},body:JSON.stringify(m.params),signal:AbortSignal.timeout(115000)});
    assert.ok(r.ok);result=await r.json();
   }else throw Error('unsupported method');
   console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));
  }catch{if(m?.id!==undefined)console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'Live connector transport failed'}}))}
 });
}
