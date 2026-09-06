import { PROVIDER_VERSION, FIELD_CATALOG } from './index.js';
export const REGISTRATION_TOOL = 'get_company_registration_info';
const fields = Object.freeze({
  credit_no: ['统一社会信用代码', '信用代码'],
  legal_person: ['法定代表人', '负责人', '经营者'],
  established_date: ['成立日期'],
  registered_address: ['注册地址', '住所', '经营场所'],
  business_status: ['登记状态', '执业状态', '证书状态'],
  registration_authority: ['登记机关'],
});
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
export function createQccProvider({ callTool, timeoutMs = 30000, now = () => new Date().toISOString() } = {}) {
  if (typeof callTool !== 'function') throw new TypeError('QCC transport is required');
  let calls = 0;
  return {
    id: 'qcc-registration', version: PROVIDER_VERSION, mode: 'qcc',
    capabilities: [{ id: 'qcc-registration', fields: FIELD_CATALOG.filter(f => !f.anchor).map(f => f.key), paid: true }],
    get calls() { return calls; },
    async lookup(request) {
      if (request.capability !== 'qcc-registration' || !Array.isArray(request.fields) || request.fields.some(f => !Object.hasOwn(fields, f))) return { status: 'error', code: 'invalid-request' };
      const searchKey = request.anchor?.company_name;
      // Ambiguous/abbreviated entities need a separate user selection, never a guessed name.
      if (!isCompleteAnchor(searchKey)) return { status: 'ambiguous', code: 'entity-selection-required' };
      const controller = new AbortController(); let timer;
      try {
        calls++;
        const result = await Promise.race([
          callTool(REGISTRATION_TOOL, { searchKey }, { signal: controller.signal }),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('timeout')); }, timeoutMs); }),
        ]);
        const data = decodeRegistration(result);
        if (!data) return { status: 'error', code: 'qcc-response-invalid' };
        if (data.无匹配项 !== undefined) return { status: 'not-found' };
        if (data['企业名称'] !== searchKey && data['统一社会信用代码'] !== searchKey) return { status: 'ambiguous', code: 'entity-mismatch', candidates: isCompleteAnchor(data['企业名称']) ? [{ company_name: data['企业名称'], credit_no: typeof data['统一社会信用代码'] === 'string' ? data['统一社会信用代码'].slice(0,32) : '' }] : [] };
        const acquiredAt = now();
        const values = {};
        for (const key of request.fields) {
          const sourceField = fields[key].find(f => typeof data[f] === 'string' && data[f].trim());
          if (sourceField) values[key] = { value: data[sourceField], source: 'qcc://' + REGISTRATION_TOOL + '/' + sourceField, acquiredAt, confidence: 1 };
        }
        return { status: 'exact', values };
      } catch { return { status: 'error', code: controller.signal.aborted ? 'qcc-timeout' : 'qcc-call-failed' }; }
      finally { clearTimeout(timer); }
    },
  };
}
