import test from 'node:test';import assert from 'node:assert/strict';
import {readZip} from 'form-fill-core/zip';import XLSX from 'xlsx';
import {reportWorkbook,reportRows,sourceLabel} from '../packages/dsh-form-fill-agent/lib/report.js';
test('separate XLSX report uses text values, Chinese status and recorded source',()=>{
 const task={result:{changes:[{sheet:'客户',cell:'B2',label:'信用代码',oldValue:0,newValue:'=1+2',source:'qcc://mcp__qcc-company__get_company_registration_info/信用代码',acquiredAt:'2026-09-10'}],incomplete:[{sheet:'客户',cell:'C2',label:'地址',reason:'no-data'}]}};
 const before=JSON.stringify(task),bytes=reportWorkbook(task),book=XLSX.read(bytes);const rows=XLSX.utils.sheet_to_json(book.Sheets['任务结果报告'],{header:1});
 assert.equal(rows[1][4],'0');assert.equal(rows[1][5],'=1+2');assert.equal(book.Sheets['任务结果报告'].F2.f,undefined);assert.match(rows[1][6],/qcc-company.*get_company_registration_info/);assert.match(rows[2][3],/无数据/);assert.equal(JSON.stringify(task),before);assert.ok(readZip(bytes).has('xl/worksheets/sheet1.xml'));
 assert.match(sourceLabel('qcc://get_contact_info/phone'),/未保存 MCP server/);assert.match(sourceLabel('mock://fixture'),/非真实/);assert.equal(reportRows(task).length,2);
});
