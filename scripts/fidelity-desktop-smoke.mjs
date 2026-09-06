import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import XLSX from 'xlsx';
import {fixtureBytes} from './generate-fixtures.mjs';
import {readZip,writeZip} from '../packages/form-fill-core/lib/zip.js';
import {previewBytes} from 'dsh-form-fill-agent';
import {applyChangeSet} from 'form-fill-core';
const directory=await mkdtemp(join(tmpdir(),'form-fill-calc-'));
try{
 const entries=readZip(fixtureBytes('合成重算',['企业名称','法定代表人'],[['合成客户甲有限公司','']],{title:false})),path='xl/worksheets/sheet1.xml';
 entries.set(path,Buffer.from(entries.get(path).toString().replace('ref="A1:B2"','ref="A1:B3"').replace('</sheetData>','<row r="3"><c r="B3"><f>LEN(B2)</f><v>999</v></c></row></sheetData>')));
 const bytes=writeZip(entries),p=await previewBytes(bytes),filled=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}).bytes;
 await writeFile(join(directory,'synthetic.xlsx'),filled);await mkdir(join(directory,'output'));
 await promisify(execFile)(process.env.SOFFICE_BIN||'soffice',['-env:UserInstallation='+pathToFileURL(join(directory,'profile')).href,'--headless','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',join(directory,'output'),join(directory,'synthetic.xlsx')],{timeout:60000});
 const sheet=XLSX.read(await readFile(join(directory,'output/synthetic.xlsx'))).Sheets['合成重算'];
 assert.equal(sheet.B2.v,'合成人员甲');assert.equal(sheet.B3.v,5);assert.equal(sheet.B3.f,'LEN(B2)');
 console.log('Independent LibreOffice headless recalculation: synthetic XLSX opens, formula retained, stale 999 replaced by 5 PASS; not Microsoft Excel acceptance');
}finally{await rm(directory,{recursive:true,force:true})}
