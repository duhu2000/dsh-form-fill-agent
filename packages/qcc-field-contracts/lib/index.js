const field = (id, label, sourceKey, aliases) => Object.freeze({id,label,sourceKey,aliases:Object.freeze(aliases)});
export const ACTUAL_CONTROLLER_GROUP = Object.freeze({
 id:'actual_controller',label:'实际控制人',sourceTool:'get_actual_controller',releaseBatch:'controller',
 selectionNote:'仅完整且唯一控制人自动补全；多名或分页结果留空待人工核验',
 fields:Object.freeze([
  field('actual_controller_name','实际控制人名称','实际控制人名称',['实控人','实际控制人','企业实控人名称','企业实际控制人','企业实控人名称（自然人请填写姓名）']),
  field('actual_controller_direct_ratio','实控人直接持股比例','直接持股比例',['实际控制人直接持股比例']),
  field('actual_controller_total_ratio','实控人总持股比例','总持股比例',['实际控制人总持股比例']),
  field('actual_controller_voting_ratio','实控人表决权比例','表决权比例',['实际控制人表决权比例']),
 ])
});
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const empty = v => v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());
const issue = (code,message,reviewRequired=false) => ({code,message,reviewRequired});
export function projectActualController(data) {
 const allIssue = detail => ({values:{},issues:Object.fromEntries(ACTUAL_CONTROLLER_GROUP.fields.map(f=>[f.id,detail]))});
 if(!record(data) || !Array.isArray(data.实际控制人信息)) return allIssue(issue('invalid-response','实控人返回结构异常，未自动填写',true));
 const rows=data.实际控制人信息;
 if(data.has_more !== false || !empty(data.next_cursor)) return allIssue(issue('incomplete-result','实控人结果尚未完整，需人工核验',true));
 if(!Number.isSafeInteger(data.total_count) || data.total_count<0 || data.total_count!==rows.length) return allIssue(issue('invalid-count','实控人返回总数与明细不一致，需人工核验',true));
 if(!rows.length) return allIssue(issue('no-record','未发现公开实控人记录'));
 if(rows.length!==1) return allIssue(issue('multiple-controllers','返回多名实际控制人，需人工核验；未默认选择第一人',true));
 const row=rows[0];
 if(!record(row) || typeof row.实际控制人名称!=='string' || !row.实际控制人名称.trim()) return allIssue(issue('missing-name','实控人名称缺失，无法绑定比例，需人工核验',true));
 const values={},issues={};
 for(const f of ACTUAL_CONTROLLER_GROUP.fields){
  const value=row[f.sourceKey];
  if(empty(value)) {issues[f.id]=issue('not-disclosed','该实控人字段未披露 / 未返回');continue;}
  // Never coerce objects, recompute or round percentages.
  if(typeof value!=='string' || value.length>32767 || /[\u0000-\u001f]/.test(value) || (f.id!=='actual_controller_name' && !/^(?:100(?:\.0+)?|(?:0|[1-9][0-9]?)(?:\.[0-9]+)?)%$/.test(value))){
   issues[f.id]=issue('invalid-value','实控人字段格式异常，未自动填写',true);continue;
  }
  values[f.id]=value;
 }
 return {values,issues};
}
