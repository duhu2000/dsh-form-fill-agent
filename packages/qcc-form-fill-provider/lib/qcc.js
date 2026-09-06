import { PROVIDER_VERSION, FIELD_CATALOG } from './index.js';
export const REGISTRATION_TOOL = 'get_company_registration_info';
import { SOURCE_FIELDS as fields } from './fields.js';
export const ENTITY_TOOL='get_company_by_query';
export function decodeCandidates(result){
 const data=decodeRegistration(result);if(!data)return {status:'error',code:'qcc-response-invalid'};
 if(data.匹配结果==='未匹配')return {status:'not-found'};
 if(!['多候选','唯一精确匹配'].includes(data.匹配结果))return {status:'error',code:'qcc-response-invalid'};
 if(data.匹配结果==='唯一精确匹配' && Array.isArray(data.企业信息))return {status:'error',code:'qcc-response-invalid'};
 const rows=Array.isArray(data.企业信息)?data.企业信息:[data.企业信息];
 if(!rows.length||rows.length>5)return {status:'error',code:'qcc-response-invalid'};
 const candidates=rows.filter(c=>typeof c?.企业名称==='string'&&c.企业名称.trim()&&c.企业名称.length<=256&&!/[\x00-\x1f]/.test(c.企业名称)&&typeof c?.统一社会信用代码==='string').map(c=>({company_name:c.企业名称,credit_no:c.统一社会信用代码.slice(0,32)}));
 return candidates.length===rows.length?{status:'ambiguous',candidates}:{status:'error',code:'qcc-response-invalid'};
}
export function isCompleteAnchor(value) {
  return typeof value === 'string' && value.length <= 256 && !/[\x00-\x1f]/.test(value) &&
    (/^[0-9A-Z]{18}$/.test(value) || /(?:有限公司|有限责任公司|合伙企业|普通合伙企业|有限合伙企业|特殊普通合伙|个人独资企业|外资企业|全民所有制|集体所有制|联营企业|股份合作企业|律师事务所|农民专业合作社(?:联合社)?)$/.test(value));
}
export function decodeRegistration(result) {
  if (result?.isError) return null;
  let data = result?.structuredContent;
  if (data === undefined) {
    const texts = result?.content?.filter(c => c.type === 'text');
    if (texts) { if (texts.length !== 1) return null; try { data = JSON.parse(texts[0].text); } catch { return null; } }
    else data = result;
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}
export function createQccProvider({ callTool, timeoutMs = 30000, enableEntitySearch = false, now = () => new Date().toISOString() } = {}) {
  if (typeof callTool !== 'function') throw new TypeError('QCC transport is required');
  let calls = 0;
  return {
    id: 'qcc-registration', version: PROVIDER_VERSION, mode: 'qcc',
    capabilities: [{ id: 'qcc-registration', fields: Object.keys(fields), paid: true, ...(enableEntitySearch ? {maxCallsPerLookup:2} : {}) }],
    get calls() { return calls; },
    async lookup(request, {signal} = {}) {
      if (request.capability !== 'qcc-registration' || !Array.isArray(request.fields) || request.fields.some(f => !Object.hasOwn(fields, f))) return { status: 'error', code: 'invalid-request' };
      const searchKey = request.anchor?.company_name??request.anchor?.credit_no;
      // Ambiguous/abbreviated entities need a separate user selection, never a guessed name.
      if (!isCompleteAnchor(searchKey) && !enableEntitySearch) return { status: 'ambiguous', code: 'entity-selection-required' };
      const controller = new AbortController(); let timer;
      const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
      try {
        if(controller.signal.aborted)return {status:'cancelled'};
        const dispatch = async (tool) => {
          if(controller.signal.aborted)throw Error('aborted');
          calls++;
          let abort;
          try { return await Promise.race([
            Promise.resolve().then(()=>callTool(tool,{searchKey},{signal:controller.signal})),
            new Promise((_,reject)=>{abort=()=>reject(Error('aborted'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);})
          ]); } finally {clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}
        };
        if(!isCompleteAnchor(searchKey)){
          if(typeof searchKey!=='string'||!searchKey.trim()||searchKey.length>256)return {status:'error',code:'invalid-request'};
          return decodeCandidates(await dispatch(ENTITY_TOOL));
        }
        const result = await dispatch(REGISTRATION_TOOL);
        const data = decodeRegistration(result);
        if (!data) return { status: 'error', code: 'qcc-response-invalid' };
        if (data.无匹配项 !== undefined) return enableEntitySearch ? decodeCandidates(await dispatch(ENTITY_TOOL)) : { status: 'not-found' };
        if (data['企业名称'] !== searchKey && data['统一社会信用代码'] !== searchKey) return { status: 'ambiguous', code: 'entity-mismatch', candidates: isCompleteAnchor(data['企业名称']) ? [{ company_name: data['企业名称'], credit_no: typeof data['统一社会信用代码'] === 'string' ? data['统一社会信用代码'].slice(0,32) : '' }] : [] };
        const acquiredAt = now();
        const values = {};
        for (const key of request.fields) {
          const sourceField = fields[key].find(f => typeof data[f] === 'string' && data[f].trim());
          if (sourceField) values[key] = { value: data[sourceField], source: 'qcc://' + REGISTRATION_TOOL + '/' + sourceField, acquiredAt, confidence: 1 };
        }
        return { status: 'exact', values };
      } catch { if(signal?.aborted)return {status:'cancelled'};return { status: 'error', code: controller.signal.aborted ? 'qcc-timeout' : 'qcc-call-failed' }; }
      finally { clearTimeout(timer);signal?.removeEventListener('abort',cancel); }
    },
  };
}
