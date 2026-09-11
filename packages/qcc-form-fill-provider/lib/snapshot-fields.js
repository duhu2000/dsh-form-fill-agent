// Explicit first-record projections. Never combine people or reporting periods.
export const SNAPSHOT_GROUP_ORDER = Object.freeze(['company_registration', 'contact_info', 'actual_controller', 'beneficial_owners', 'company_profile', 'financial_data', 'tax_invoice_info', 'listing_info', 'import_export_credit', 'company_risk_scan', 'company_related_risk_scan']);
export const SNAPSHOT_GROUPS = Object.freeze([
  { id: 'beneficial_owners', label: '受益所有人', sourceTool: 'get_beneficial_owners',
    selectionNote: '仅取返回首条受益所有人，不代表唯一或最大受益人',
    fields: [{ id: 'beneficial_owner_first_name', label: '受益所有人名称（首条）', aliases: ['受益所有人', '受益所有人名称', 'UBO'] }] },
  { id: 'financial_data', label: '财务数据', sourceTool: 'get_financial_data',
    selectionNote: '取返回首个报告期的主要财务指标；不跨期补值',
    fields: [
      { id: 'financial_total_revenue', label: '营业总收入', sourceKey: '营业总收入', aliases: ['营业总收入'] },
      { id: 'financial_total_profit', label: '利润总额', sourceKey: '利润总额', aliases: ['利润总额'] },
      { id: 'financial_total_assets', label: '总资产', sourceKey: '总资产', aliases: ['总资产'] },
    ] },
]);
const scalar = v => (typeof v === 'string' && v.trim() && v.length <= 32767) || (typeof v === 'number' && Number.isFinite(v));
export function projectFirstSnapshot(data, tool) {
  const group = SNAPSHOT_GROUPS.find(g => g.sourceTool === tool);
  if (!group) throw new Error('Unknown snapshot tool');
  const financial = tool === 'get_financial_data';
  const rows = financial ? data?.财务数据信息 : data?.受益所有人信息?.受益所有人;
  const first = Array.isArray(rows) ? rows[0] : null;
  const values = {}, issues = {};
  for (const field of group.fields) {
    const value = financial ? first?.指标详情?.主要财务指标?.[field.sourceKey] : first?.受益所有人名称;
    if (scalar(value) && (financial || typeof value === 'string') && (!financial || (typeof first?.报告期 === 'string' && first.报告期.trim()))) values[field.id] = value;
    else issues[field.id] = { code: Array.isArray(rows) && !rows.length ? 'no-record' : 'not-disclosed', message: '首条记录该字段未披露 / 未返回；未使用其他记录替代', reviewRequired: false };
  }
  return { values, issues, provenance: { selection: 'first-returned', recordCount: Array.isArray(rows) ? rows.length : 0,
    ...(financial ? { reportPeriod: first?.报告期 ?? '', disclosure: first?.披露等级 ?? '' } : {}) } };
}
