import { parseWorkbook } from 'form-fill-core';

const retained = new Set(['no-data','user-excluded','formula-preserved','hidden-or-merged','hidden-row','hidden-sheet','sheet-excluded','protected-source-range','placeholder-needs-confirmation']);
export function taskPresentation(task) {
  const items=task.preview.changeSet.incomplete;
  const failures=Math.max(task.state==='failed'?1:0,items.filter(i=>i.reason==='provider-error').length);
  const review=items.filter(i=>i.reason!=='provider-error'&&!retained.has(i.reason)).length;
  const noData=items.filter(i=>i.reason==='no-data').length;
  const running=task.state==='enriching';
  const ended=!running&&(!!task.progress||!!task.result||task.state==='failed');
  const interrupted=['cancelled','interrupted'].includes(task.state);
  const status=running?'处理中':!ended?'待确认字段':task.state==='failed'?'执行失败':review||failures||interrupted?'处理结束（需核验）':noData?'已完成（部分字段无数据）':'已完成';
  const total=task.progress?.total||0,completed=task.progress?.completed||0;
  // A stopped/cancelled run must not imply that all planned items ran.
  const percent=ended&&!interrupted&&task.state!=='failed'?100:total?Math.min(99,Math.floor(completed/total*100)):0;
  const subjects=new Set();
  const document=parseWorkbook(task.bytes);
  for(const table of task.preview.analysis.tables){
    const sheet=document.sheets.find(s=>s.name===table.sheet);
    const cells=new Map(Object.values(sheet?.cells||{}).map(c=>[c.row+':'+c.column,c]));
    const inputs=table.mappings.filter(m=>table.anchorColumns?table.anchorColumns.includes(m.column):table.anchors.includes(m.field));
    for(const row of sheet?.rows||[]){
      if(row.hidden||row.number<=table.headerRow)continue;
      const values=inputs.map(m=>{const c=cells.get(row.number+':'+m.column);return c&&!c.formula&&!c.hidden?c.value.trim():''});
      if(values.some(Boolean))subjects.add(JSON.stringify(values));
    }
  }
  const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(task.created)).replace('/', '-');
  return {title:(task.filename||'未命名表格').replace(/\.xlsx$/i,'')+'｜'+subjects.size+' 家企业｜'+date,status,running,ended,percent,completed,total,failures,review,noData};
}
export const isResultExplanation = item => retained.has(item.reason);
