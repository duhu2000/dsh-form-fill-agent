export const REASON_LABELS = {
 'missing-anchor':'缺少可用主体标识，请修正名称或信用代码映射',
 'missing-anchor-field':'主体标识为空',
 'unknown-field':'字段尚未映射',
 'user-excluded':'未纳入本次字段范围或已选择不填写',
 'provider-unavailable':'当前无可用数据来源',
 'candidate-review-required':'需要人工确认主体候选',
 'no-match':'数据来源未匹配到主体',
 'no-data':'查询成功，但该字段未返回数据',
 'field-review-required':'字段返回多值或不完整，需人工核验',
 'provider-error':'调用失败，请检查连接或重试',
 'cancelled':'查询已取消',
 'not-started':'尚未执行',
 'ambiguous-source':'存在多个数据来源，需明确来源',
 'formula-preserved':'公式保留，不填写',
 'error-cell':'原表错误单元格保留',
 'hidden-or-merged':'隐藏或合并区域保留',
 'hidden-row':'隐藏行保留',
 'sheet-excluded':'工作表未选择',
 'protected-source-range':'下拉来源或表格保留区域，不填写',
 'placeholder-needs-confirmation':'原有占位内容需确认',
 'low-confidence':'返回数据置信度不足',
 'missing-provenance':'缺少来源或获取时间',
 'invalid-value':'返回值类型无效',
 'unsafe-value':'返回值未通过安全检查',
 'validation-conflict':'返回值不符合原表下拉规则',
};
export function diagnostics(preview) {
 const reasons=new Map(),columns=new Map();
 for(const table of preview.analysis.tables)for(const m of table.mappings)columns.set(table.sheet+':'+m.column,{sheet:table.sheet,column:m.column,label:m.label,field:m.field,ready:0,incomplete:0});
 for(const item of preview.changeSet.incomplete){
  const key=item.reason;
  if(!reasons.has(key))reasons.set(key,{code:key,label:REASON_LABELS[key]||'保留原值或需要人工核验',count:0,unit:key==='missing-anchor'?'行':'项'});
  reasons.get(key).count++;
 }
 for(const [items,key] of [[preview.changeSet.changes,'ready'],[preview.changeSet.incomplete,'incomplete']])for(const item of items){
  if(!item.cell)continue;
  let column=0;for(const c of item.cell.match(/^[A-Z]+/)?.[0]||'')column=column*26+c.charCodeAt(0)-64;
  const value=columns.get(item.sheet+':'+column);if(value)value[key]++;
 }
 return {reasons:[...reasons.values()],columns:[...columns.values()],plannedFields:[...new Set(preview.plan.calls.flatMap(c=>c.fields))]};
}
export function renderEnrichmentResult(value) {
 const reasons=value.diagnostics?.reasons||[];
 return 'AI填表：可填写 '+value.filled+' 格，未完成 '+value.incomplete+' 项。'
  +(reasons.length?'原因分类：'+reasons.map(r=>r.label+' '+r.count+r.unit).join('；')+'。':'')
  +'可填写仅代表预览，尚未写入副本；必须在工作台确认后下载。未完成包含范围排除、映射或查询问题，不可统一解释为企查查查不到。预览：'+value.previewPath;
}
