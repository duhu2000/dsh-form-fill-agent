// TEST ONLY: installed solely in isolated synthetic profiles; never packed with the product.
import {randomUUID} from 'node:crypto';
export const name='ff-synthetic-tool-probe';
export const inject=['tools','agents','webServer'];
export function apply(ctx){
 let calls=0;
 ctx.tools.register({name:'mcp__qcc-company__get_company_registration_info',description:'Synthetic fixture only',parameters:{type:'object',properties:{searchKey:{type:'string'}},required:['searchKey']},output:{schema:{type:'object',additionalProperties:true},render:()=>[]},async execute(args,exec){if(!exec.agent||!exec.token)throw Error('missing real execution context');calls++;return {'企业名称':args.searchKey,'统一社会信用代码':'SYNTHETIC-PIPELINE'}}});
 const dispose=ctx.webServer.register({kind:'prefix',path:'/ff-synthetic-probe',async handler(req,res){
  let handle;
  try{
   if(req.method!=='POST')throw Error('POST only');
   const chunks=[];for await(const c of req)chunks.push(c);const args=JSON.parse(Buffer.concat(chunks));
   if(!/^[a-f0-9-]{36}$/.test(args.taskId))throw Error('fixture task required');
   handle=await ctx.agents.create({sessionId:'ff-probe-'+randomUUID()});
   handle.agent.session.append('user/message',{role:'user',content:[{type:'text',text:'请使用合成企查查数据补全本次合成填表任务。'}]},{surfaceOp:'append'});
   const result=await ctx.tools.execute({name:'form_fill_enrich',arguments:args,callId:randomUUID(),signal:new AbortController().signal,agent:handle.agent});
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({result,calls,snapshotEvents:typeof handle.agent.session.snapshotEvents==='function'}));
  }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}))}finally{await handle?.dispose()}
 }});ctx.effect(()=>()=>dispose());
}
