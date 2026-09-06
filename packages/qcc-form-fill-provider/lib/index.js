export const PROVIDER_VERSION = '0.1.0-alpha.9';
import {ADDITIONAL_FIELDS} from './extended.js';
import {QCC_FIELD_CATALOG} from './catalog.js';
export {createCatalogProvider,CATALOG_TOOL_DOMAINS,runtimeToolNames} from './extended.js';
export {QCC_FIELD_CATALOG} from './catalog.js';
import { EXTRA_FIELDS } from './fields.js';
export { createQccProvider, decodeRegistration, isCompleteAnchor, REGISTRATION_TOOL, ENTITY_TOOL, decodeCandidates } from './qcc.js';
// Provider-owned vocabulary; the caller supplies the authorized transport.
export const FIELD_CATALOG = Object.freeze([
  { key: 'company_name', label: '企业名称', aliases: ['公司名称', '客户名称', '供应商名称', '主体名称'], anchor: true, type: 'string' },
  { key: 'credit_no', label: '统一社会信用代码', aliases: ['信用代码', '社会信用代码', '税号'], anchorFallback:true, type: 'string' },
  { key: 'legal_person', label: '法定代表人', aliases: ['法人代表', '法人','legal_rep'], type: 'string' },
  { key: 'established_date', label: '成立日期', aliases: ['成立时间','establish_date'], type: 'date' },
  { key: 'registered_address', label: '注册地址', aliases: ['住所', '公司地址'], type: 'string' },
  { key: 'business_status', label: '经营状态', aliases: ['登记状态','reg_status'], type: 'string' },
  { key: 'registration_authority', label: '登记机关', aliases: [], type: 'string' },
  ...EXTRA_FIELDS,
  ...QCC_FIELD_CATALOG.slice(1).flatMap(g=>g.fields.map(f=>({key:f.id,label:f.label,aliases:[]}))),
  ...ADDITIONAL_FIELDS,
]);
const synthetic = Object.freeze({
  '合成客户甲有限公司': { credit_no: 'SYNTHETIC-CUSTOMER-A', legal_person: '合成人员甲', established_date: '2020-01-02', registered_address: '合成市示例路 1 号' },
  '合成客户乙有限公司': { credit_no: 'SYNTHETIC-CUSTOMER-B', legal_person: '合成人员乙', established_date: '2021-02-03', registered_address: '合成市示例路 2 号' },
  '合成供应商甲有限公司': { credit_no: 'SYNTHETIC-SUPPLIER-A', legal_person: '合成人员丙', business_status: '合成示例：存续', registration_authority: '合成登记机关' },
  '合成合同甲方有限公司': { credit_no: 'SYNTHETIC-PARTY-A', legal_person: '合成人员丁', registered_address: '合成市合同路 1 号' },
  '合成合同乙方有限公司': { credit_no: 'SYNTHETIC-PARTY-B', legal_person: '合成人员戊', registered_address: '合成市合同路 2 号' },
});
export function createMockProvider({ acquiredAt = '2026-09-06T00:00:00.000Z' } = {}) {
  let calls = 0;
  return {
    id: 'synthetic-qcc-mock', version: PROVIDER_VERSION, mode: 'mock',
    capabilities: [{ id: 'synthetic-registration', fields: FIELD_CATALOG.filter(f => !f.anchor).map(f => f.key), paid: false }],
    get calls() { return calls; },
    async lookup(request) {
      calls++;
      if (request.capability !== 'synthetic-registration') return { status: 'error', code: 'unknown-capability' };
      if (request.anchor.company_name === '合成多候选有限公司') return { status: 'ambiguous' };
      if (request.anchor.company_name === '合成待选主体有限公司') return { status: 'ambiguous', candidates: ['合成客户甲有限公司','合成客户乙有限公司'].map(company_name => ({ company_name, credit_no: synthetic[company_name].credit_no })) };
      const record = synthetic[request.anchor.company_name];
      if (!record) return { status: 'not-found' };
      return { status: 'exact', values: Object.fromEntries(request.fields.filter(field => Object.hasOwn(record, field)).map(field => [field, { value: record[field], source: 'mock://synthetic-registration/' + field, acquiredAt, confidence: 1 }])) };
    },
  };
}
