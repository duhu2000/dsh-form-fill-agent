import {writeZip} from 'form-fill-core/zip';
import {REASON_LABELS} from './diagnostics.js';
import {isResultExplanation} from './task-presentation.js';
const escape=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function sourceLabel(source){
 if(String(source).startsWith('mock://'))return '合成示例（非真实查询）';
 const match=/^qcc:\/\/(mcp__([^/]+?)__([^/]+))\/(.*)$/.exec(source||'');
 if(match)return `企查查 MCP · ${match[2]} · ${match[3]} · ${match[4]}`;
 if(String(source).startsWith('qcc://'))return '企查查 · '+source.slice(6)+'（历史记录未保存 MCP server）';
 return '未记录来源';
}
export function reportRows(task){return [
 ...task.result.changes.map(c=>[c.sheet,c.cell,c.label,'已填写',c.oldValue??'',c.newValue??'',sourceLabel(c.source),c.acquiredAt||'','']),
 ...task.result.incomplete.map(i=>[i.sheet,i.cell||`第 ${i.row} 行`,i.label||'',isResultExplanation(i)?'保留原值 / 无数据':'待核验 / 失败','','','', '',REASON_LABELS[i.reason]||'需要人工核验'])
]}
export function reportWorkbook(task){
 const rows=[['工作表','位置','原表字段','结果状态','原值','填写值','数据来源','获取时间','结果说明'],...reportRows(task)];
 const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>'+rows.map((r,n)=>'<row r="'+(n+1)+'">'+r.map((v,c)=>'<c r="'+String.fromCharCode(65+c)+(n+1)+'" t="inlineStr"><is><t xml:space="preserve">'+escape(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
 return writeZip(new Map(Object.entries({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="任务结果报告" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':sheet
 }).map(([name,value])=>[name,Buffer.from(value)])));
}
