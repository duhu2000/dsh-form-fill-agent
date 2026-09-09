import {QCC_FIELD_CATALOG} from './catalog.js';
import * as project from './projections.js';
import {createQccProvider,decodeRegistration} from './qcc.js';
import {PROVIDER_VERSION} from './index.js';
import {ACTUAL_CONTROLLER_GROUP,projectActualController} from 'qcc-field-contracts';
import {SNAPSHOT_GROUPS,projectFirstSnapshot} from './snapshot-fields.js';
const definitions={
 get_beneficial_owners:{map:data=>projectFirstSnapshot(data,'get_beneficial_owners').values,domain:'company'},
 get_financial_data:{map:data=>projectFirstSnapshot(data,'get_financial_data').values,domain:'company'},
 get_actual_controller:{map:data=>projectActualController(data).values,domain:'company'},
 get_company_profile:{map:project.mapProfileFields,domain:'company'},
 get_contact_info:{map:project.mapContactFields,domain:'company',args:{excludeInvalidPhone:false}},
 get_listing_info:{map:project.mapListingFields,domain:'company'},
 get_tax_invoice_info:{map:project.mapTaxInvoiceFields,domain:'company'},
 get_import_export_credit:{map:project.mapImportExportCreditFields,domain:'operation'},
 get_company_risk_scan:{map:project.mapCompanyRiskScanFields,domain:'risk',inspect:project.inspectSelfRiskCatalog},
 get_company_related_risk_scan:{map:project.mapCompanyRelatedRiskScanFields,domain:'risk',inspect:project.inspectRelatedRiskCatalog},
};
export const CATALOG_TOOL_DOMAINS=Object.freeze({get_company_registration_info:'company',get_company_by_query:'company',...Object.fromEntries(Object.entries(definitions).map(([k,v])=>[k,v.domain]))});
// Live September 7 contract adds this DB-driven dimension; the legacy 128-field snapshot stays immutable.
export const ADDITIONAL_FIELDS=Object.freeze([{key:'related_risk_disciplinary_list_count',label:'关联风险-惩戒名单条目数',aliases:[]}]);
export function runtimeToolNames(tool){const domain=CATALOG_TOOL_DOMAINS[tool];return domain?['mcp__qcc-'+domain+'__','mcp__'+domain+'__','mcp__qcc_'+domain+'__'].map(p=>p+tool):[]}
export function createCatalogProvider({callTool,availableTools=[],enableEntitySearch=false,timeoutMs=120000,now=()=>new Date().toISOString()}={}){
 const registration=createQccProvider({callTool,enableEntitySearch,timeoutMs,now});let calls=0;
 const groups=[...QCC_FIELD_CATALOG,ACTUAL_CONTROLLER_GROUP,...SNAPSHOT_GROUPS].filter(g=>definitions[g.sourceTool]&&availableTools.includes(g.sourceTool)).map(g=>g.sourceTool==='get_company_related_risk_scan'?{...g,fields:[...g.fields,...ADDITIONAL_FIELDS.map(f=>({id:f.key,label:f.label}))]}:g);
 return {
  id:'qcc-catalog',version:PROVIDER_VERSION,mode:'qcc',
  capabilities:[...registration.capabilities,...groups.map(g=>({id:'qcc-'+g.sourceTool,fields:g.fields.map(f=>f.id),paid:true,maxCallsPerLookup:2}))],
  get calls(){return registration.calls+calls},
  async lookup(request,{signal}={}){
   if(request.capability==='qcc-registration')return registration.lookup(request,{signal});
   const searchKey=request.anchor?.company_name??request.anchor?.credit_no;
   const group=groups.find(g=>'qcc-'+g.sourceTool===request.capability);
   if(!group||!Array.isArray(request.fields)||request.fields.some(f=>!group.fields.some(x=>x.id===f)))return {status:'error',code:'invalid-request'};
   // Verify exact identity before requesting another domain; ambiguous entities stay in the selection flow.
   const identity=await registration.lookup({capability:'qcc-registration',anchor:request.anchor,fields:['credit_no']},{signal});
   if(identity.status!=='exact')return identity;
   const definition=definitions[group.sourceTool],controller=new AbortController();let timer,abort;
   const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
   try{
    if(controller.signal.aborted)return {status:'cancelled'};
    const response=await Promise.race([
     Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error('aborted');calls++;return callTool(group.sourceTool,{searchKey:searchKey,...definition.args},{signal:controller.signal})}),
     new Promise((_,reject)=>{abort=()=>reject(Error('aborted'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs)})
    ]);
    const data=decodeRegistration(response);if(!data)return {status:'error',code:'qcc-response-invalid'};
    if(data.企业名称 && !/^[0-9A-Z]{18}$/.test(searchKey) && data.企业名称!==searchKey)return {status:'error',code:'qcc-entity-mismatch'};
    if(data.无匹配项!==undefined||data.地域限制!==undefined)return {status:'not-found'};
    const inspection=definition.inspect?.(data);
    if(inspection){
     const counts=group.sourceTool==='get_company_risk_scan'?[data.有记录因子数,data.无记录因子数,...(data.风险因子扫描||[]).map(r=>r.条目数)]:[data.有风险关联方数,...Object.values(data.维度计数汇总?.重要风险??data.维度计数汇总?.关键风险??{}),...(data.重点维度关联方定位||[]).map(r=>r.命中关联方数)];
     if(counts.some(v=>v!==undefined&&v!==null&&v!==''&&(!['string','number'].includes(typeof v)||!/^(0|[1-9][0-9]*)$/.test(String(v))||!Number.isSafeInteger(Number(v)))))return {status:'error',code:'qcc-response-invalid'};
    }
    const unknown=inspection?.unknown.filter(label=>!(group.sourceTool==='get_company_related_risk_scan'&&label==='重要风险:惩戒名单'));
    if(inspection&&(!inspection.applicable||inspection.missing.length||unknown.length))return {status:'error',code:'qcc-catalog-drift'};
    const projected=definition.map(data),values={},acquiredAt=now();
    if(group.sourceTool==='get_company_related_risk_scan'){
     const raw=(data.维度计数汇总?.重要风险??data.维度计数汇总?.关键风险)?.惩戒名单;
     if(raw!==undefined){if(!/^[0-9]+$/.test(String(raw))||!Number.isSafeInteger(Number(raw)))return {status:'error',code:'qcc-response-invalid'};
      projected.related_risk_disciplinary_list_count=String(raw);
      if(Number(raw)>0)projected.related_risk_summary+=(projected.related_risk_summary?'；':'')+'惩戒名单('+String(raw)+')';
     }
    }
    for(const field of request.fields){const value=projected[field];if(!['string','number'].includes(typeof value)||!String(value).trim()||String(value).includes('[object Object]')||typeof value==='number'&&!Number.isFinite(value))continue;
     const snapshot=SNAPSHOT_GROUPS.some(g=>g.sourceTool===group.sourceTool)?projectFirstSnapshot(data,group.sourceTool):null;
     values[field]={value:String(value),source:'qcc://'+group.sourceTool+'/projection/'+field+(snapshot?'?selection=first-returned'+(snapshot.provenance.reportPeriod?'&reportPeriod='+encodeURIComponent(snapshot.provenance.reportPeriod):''):''),acquiredAt,confidence:1};
    }
    const fieldIssues=group.sourceTool==='get_actual_controller'?Object.fromEntries(Object.entries(projectActualController(data).issues).filter(([field])=>request.fields.includes(field))):{};
    return {status:'exact',values,...(Object.keys(fieldIssues).length?{fieldIssues}:{})};
   }catch{return signal?.aborted?{status:'cancelled'}:{status:'error',code:controller.signal.aborted?'qcc-timeout':'qcc-call-failed'}}
   finally{clearTimeout(timer);if(abort)controller.signal.removeEventListener('abort',abort);signal?.removeEventListener('abort',cancel)}
  }
 };
}
