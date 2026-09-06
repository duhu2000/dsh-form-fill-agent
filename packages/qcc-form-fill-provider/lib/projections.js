import {SELF_RISK_FACTORS,RELATED_RISK_FACTORS,RELATED_RISK_KEY_FACTORS,RISK_FACTOR_CATALOG_VERSION} from './catalog.js';
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
class QccBridgeError extends Error { constructor(code,message){super(message);this.code=code;} }
export function mapProfileFields(value) {
  if (!isRecord(value)) {
    throw new QccBridgeError('QCC_CONTRACT_MISMATCH', 'QCC profile tool returned a non-object result');
  }
  if (value.无匹配项 !== undefined) return {};
  return {
    // 工具只返回“企查查行业”这一最细层级展示值，不得猜测为一级或二级行业。
    qcc_industry: String(value.企查查行业 ?? ''),
    company_profile: String(value.企业简介 ?? value.简介 ?? ''),
    industry_chain_overview: String(value.产业链概览 ?? ''),
  };
}

function scalarText(value, ...keys) {
  if (!isRecord(value)) return '';
  for (const key of keys) {
    const item = value[key];
    if (item !== undefined && item !== null && String(item).trim()) return String(item);
  }
  return '';
}

function scalarMap(value, mapping) {
  if (!isRecord(value) || value.无匹配项 !== undefined || value.地域限制 !== undefined) return {};
  return Object.fromEntries(mapping.map(([id, ...keys]) => [id, scalarText(value, ...keys)]));
}

export function mapContactFields(value) {
  if (!isRecord(value)) return {};
  const contact = isRecord(value.联系方式信息) ? value.联系方式信息 : {};
  const phone = Array.isArray(contact.电话) && isRecord(contact.电话[0]) ? contact.电话[0] : {};
  const email = Array.isArray(contact.邮箱) && isRecord(contact.邮箱[0]) ? contact.邮箱[0] : {};
  const website = Array.isArray(contact.网址)
    ? contact.网址.find((item) => isRecord(item) && item.是否是官网 === '是') ?? {}
    : {};
  return {
    contact_preferred_phone: scalarText(phone, '电话号码'),
    contact_phone_invalid_flag: scalarText(phone, '是否无效'),
    contact_phone_tags: Array.isArray(phone.标签)
      ? phone.标签.map((item) => String(item).trim()).filter(Boolean).join('；')
      : '',
    contact_preferred_email: scalarText(email, '邮箱'),
    contact_official_website: scalarText(website, '网址'),
    contact_official_website_icp: scalarText(website, 'ICP备案'),
  };
}

export function mapListingFields(value) {
  return scalarMap(value, [
    ['listing_date', '上市日期'],
    ['listing_short_name', '股票简称'],
    ['listing_stock_code', '股票代码'],
    ['listing_exchange', '上市交易所'],
    ['listing_board', '上市板块'],
    ['listing_former_short_name', '上市曾用名'],
    ['listing_total_market_value', '总市值'],
    ['listing_total_shares', '总股本'],
    ['listing_predicted_pe', '预测市盈率'],
    ['listing_float_market_value', '流通值'],
    ['listing_float_shares', '流通股'],
    ['listing_pb_ratio', '市净率'],
    ['listing_eps', 'EPS'],
    ['listing_voting_rights_difference', '表决权差异'],
    ['listing_registration_based', '是否注册制'],
  ]);
}

export function mapTaxInvoiceFields(value) {
  return scalarMap(value, [
    ['tax_company_name', '企业名称'],
    ['tax_identification_no', '纳税人识别号'],
    ['tax_company_type', '企业类型'],
    ['tax_business_status', '经营状态'],
    ['invoice_address', '地址'],
    ['invoice_phone', '联系电话'],
    ['invoice_bank', '开户行'],
    ['invoice_bank_account', '开户行账号'],
  ]);
}

export function mapImportExportCreditFields(value) {
  return scalarMap(value, [
    ['import_export_credit_no', '统一社会信用代码'],
    ['import_export_customs', '所在地海关'],
    ['import_export_admin_division', '行政区划'],
    ['import_export_address', '地址'],
    ['import_export_economic_area', '经济区划'],
    ['import_export_trade_type', '经营类别'],
    ['import_export_statistical_economic_area', '统计经济区划'],
    ['import_export_industry', '行业种类'],
    ['import_export_ecommerce_type', '跨境贸易电子商务类型'],
    ['import_export_credit_grade', '信用等级'],
    ['import_export_filing_date', '备案日期'],
  ]);
}

function countValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : '';
}

function selfRiskRows(value) {
  return Array.isArray(value?.风险因子扫描) ? value.风险因子扫描.filter(isRecord) : [];
}

export function inspectSelfRiskCatalog(value) {
  const applicable = Array.isArray(value?.风险因子扫描);
  const actual = new Set(selfRiskRows(value).map((row) => String(row.风险因子 ?? '').trim()).filter(Boolean));
  const expected = new Set(SELF_RISK_FACTORS.map(([, label]) => label));
  return {
    applicable,
    version: RISK_FACTOR_CATALOG_VERSION,
    missing: [...expected].filter((label) => !actual.has(label)),
    unknown: [...actual].filter((label) => !expected.has(label)),
  };
}

export function mapCompanyRiskScanFields(value) {
  if (!isRecord(value) || !Array.isArray(value.风险因子扫描)) return {};
  const counts = new Map(selfRiskRows(value).map((row) => [String(row.风险因子 ?? '').trim(), countValue(row.条目数)]));
  const hits = SELF_RISK_FACTORS.flatMap(([, label]) => {
    const count = counts.get(label);
    return typeof count === 'number' && count > 0 ? [`${label}(${count})`] : [];
  });
  return {
    risk_recorded_factor_count: countValue(value.有记录因子数),
    risk_no_record_factor_count: countValue(value.无记录因子数),
    risk_hit_summary: hits.join('；'),
    ...Object.fromEntries(SELF_RISK_FACTORS.map(([id, label]) => [`risk_${id}_count`, counts.get(label) ?? ''])),
  };
}

export function inspectRelatedRiskCatalog(value) {
  const applicable = isRecord(value?.维度计数汇总);
  // QCC MCP 当前契约名为“重要风险”；“关键风险”仅作早期预发环境兼容，
  // 不得反向把兼容名称当成稳定上游契约。
  const importantSource = value?.维度计数汇总?.重要风险 ?? value?.维度计数汇总?.关键风险;
  const important = isRecord(importantSource) ? importantSource : {};
  const locating = Array.isArray(value?.重点维度关联方定位) ? value.重点维度关联方定位.filter(isRecord) : [];
  const importantActual = new Set(Object.keys(important));
  const keyActual = new Set(locating.map((row) => String(row.维度 ?? '').trim()).filter(Boolean));
  const importantExpected = new Set(RELATED_RISK_FACTORS.map(([, label]) => label));
  const keyExpected = new Set(RELATED_RISK_KEY_FACTORS.map(([, label]) => label));
  return {
    applicable,
    version: RISK_FACTOR_CATALOG_VERSION,
    missing: [
      ...[...importantExpected].filter((label) => !importantActual.has(label)).map((label) => `重要风险:${label}`),
      ...[...keyExpected].filter((label) => !keyActual.has(label)).map((label) => `重点维度:${label}`),
    ],
    unknown: [
      ...[...importantActual].filter((label) => !importantExpected.has(label)).map((label) => `重要风险:${label}`),
      ...[...keyActual].filter((label) => !keyExpected.has(label)).map((label) => `重点维度:${label}`),
    ],
  };
}

export function mapCompanyRelatedRiskScanFields(value) {
  if (!isRecord(value) || !isRecord(value.维度计数汇总)) return {};
  const importantSource = value.维度计数汇总.重要风险 ?? value.维度计数汇总.关键风险;
  const important = isRecord(importantSource) ? importantSource : {};
  const locating = Array.isArray(value.重点维度关联方定位) ? value.重点维度关联方定位.filter(isRecord) : [];
  const partyCounts = new Map(locating.map((row) => [String(row.维度 ?? '').trim(), countValue(row.命中关联方数)]));
  const hits = RELATED_RISK_FACTORS.flatMap(([, label]) => {
    const count = countValue(important[label]);
    return typeof count === 'number' && count > 0 ? [`${label}(${count})`] : [];
  });
  const partyCount = countValue(value.有风险关联方数);
  return {
    related_risk_party_count: partyCount,
    related_risk_summary: `${partyCount === '' ? '' : `有风险关联方${partyCount}个`}${hits.length ? `${partyCount === '' ? '' : '；'}${hits.join('；')}` : ''}`,
    ...Object.fromEntries(RELATED_RISK_FACTORS.map(([id, label]) => [`related_risk_${id}_count`, countValue(important[label])])),
    ...Object.fromEntries(RELATED_RISK_KEY_FACTORS.map(([id, label]) => [`related_risk_${id}_party_count`, partyCounts.get(label) ?? ''])),
  };
}

