import { parseWorkbook } from 'form-fill-core';
function integer(params,key,fallback,min,max){const raw=params.get(key);const n=raw===null?fallback:Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw Error('网格分页参数无效');return n}
function columnName(column){let out='';for(let n=column;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out}
export function gridPage(task,params){
 const document=parseWorkbook(task.bytes),sheetName=params.get('sheet'),sheet=sheetName?document.sheets.find(s=>s.name===sheetName):document.sheets[0];
 if(!sheet)throw Error('工作表不存在');
 const view=params.get('view')||'original';if(!['original','result'].includes(view))throw Error('网格视图无效');
 const page=integer(params,'page',1,1,10000),pageSize=integer(params,'pageSize',50,1,100),columnStart=integer(params,'columnStart',1,1,128),columnCount=integer(params,'columnCount',16,1,32);
 const query=(params.get('q')||'').trim().toLowerCase();if(query.length>200)throw Error('搜索内容过长');
 const cells=Object.values(sheet.cells),maxRow=Math.max(sheet.extent?.row||0,...sheet.rows.map(r=>r.number)),maxColumn=cells.reduce((n,c)=>Math.max(n,c.column),sheet.extent?.column||0);
 const changes=new Map((view==='result'?task.preview.changeSet.changes:[]).filter(c=>c.sheet===sheet.name).map(c=>[c.cell,c]));
 const byRow=new Map();for(const cell of cells){if(!byRow.has(cell.row))byRow.set(cell.row,[]);byRow.get(cell.row).push(cell)}
 for(const change of changes.values())if(!sheet.cells[change.cell]){const row=Number(change.cell.match(/\d+$/)[0]);if(!byRow.has(row))byRow.set(row,[]);byRow.get(row).push({ref:change.cell,value:change.newValue})}
 const rowNumbers=Array.from({length:maxRow},(_,i)=>i+1).filter(row=>!query||(byRow.get(row)||[]).some(c=>String(changes.get(c.ref)?.newValue??c.value).toLowerCase().includes(query)));
 const columns=Array.from({length:Math.min(columnCount,Math.max(0,maxColumn-columnStart+1))},(_,i)=>({number:columnStart+i,label:columnName(columnStart+i),hidden:sheet.hiddenColumns.some(([a,b])=>columnStart+i>=a&&columnStart+i<=b)}));
 return {sheet:sheet.name,hidden:sheet.hidden,view,revision:task.revision,sheets:document.sheets.map(s=>({name:s.name,hidden:s.hidden})),page,pageSize,totalRows:maxRow,matchingRows:rowNumbers.length,totalColumns:maxColumn,columnStart,columnCount,columns,rows:rowNumbers.slice((page-1)*pageSize,page*pageSize).map(number=>({number,hidden:sheet.rows.find(r=>r.number===number)?.hidden||false,cells:columns.map(col=>{const ref=col.label+number,c=sheet.cells[ref],change=changes.get(ref);return {ref,value:change?.newValue??c?.value??'',formula:!!c?.formula,recalculationRequired:!!c?.formula&&view==='result'&&task.preview.changeSet.changes.length>0,changed:!!change,hidden:!!c?.hidden||col.hidden}})}))};
}
